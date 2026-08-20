/**
 * Audit service.
 *
 * Every security relevant action in the product writes exactly one `AuditLog`
 * row through `recordAudit()`. Three invariants are enforced here:
 *
 *  1. Only actions from `lib/audit/actions.ts` and resource types from the same
 *     module can be written. The types make an invented string a compile error.
 *  2. The rows form a tamper evident hash chain. `prevHash` is read and `hash`
 *     is written inside one transaction that holds an advisory lock, so
 *     concurrent writers cannot fork the chain.
 *  3. Metadata is scrubbed before it is stored. Sensitive keys are dropped and
 *     values that look like an email address, phone number or token are dropped
 *     as well, so an accidental identifier never reaches the audit trail.
 *
 * Audit writes must never break the operation they describe. `recordAudit()`
 * therefore reports a failure through the logger and returns `null` instead of
 * throwing, while `recordAuditOrThrow()` exists for callers that treat the
 * audit entry as part of their contract (for example consent evidence).
 */
import type { ActorType, AuditOutcome, UserRole } from "@prisma/client";

import { canonicalJson, chainHash } from "@/lib/security/crypto";
import {
  appendAuditLog,
  listAuditChainWindow,
  type AuditChainRow,
} from "@/lib/db/repositories/audit";
import { createLogger } from "@/lib/observability/logger";
import type { ActorContext } from "@/lib/permissions/actor";

import { isAuditAction, type AuditAction, type AuditResourceType } from "./actions";

const log = createLogger("audit");

/**
 * Actor for events that happen before or without a session, for example a
 * magic link request. `userId` stays null so that the row cannot be mistaken
 * for an authenticated action.
 */
export interface AnonymousAuditActor {
  kind: "anonymous";
  requestId: string;
  ipHash: string | null;
  userAgentHash: string | null;
  /** Optional blind index of the address the request was made for. */
  emailIndex: string | null;
  /** Known user the event relates to, if the lookup already happened. */
  subjectUserId: string | null;
}

export type AuditActor = ActorContext | AnonymousAuditActor;

export function anonymousAuditActor(
  requestId: string,
  context: {
    ipHash?: string | null;
    userAgentHash?: string | null;
    emailIndex?: string | null;
    subjectUserId?: string | null;
  } = {}
): AnonymousAuditActor {
  return {
    kind: "anonymous",
    requestId,
    ipHash: context.ipHash ?? null,
    userAgentHash: context.userAgentHash ?? null,
    emailIndex: context.emailIndex ?? null,
    subjectUserId: context.subjectUserId ?? null,
  };
}

export interface RecordAuditInput {
  actor: AuditActor;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string | null;
  targetUserId?: string | null;
  outcome?: AuditOutcome;
  /** Short, non-sensitive explanation shown in the admin console. */
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditEntry {
  id: string;
  sequence: bigint;
  hash: string;
  prevHash: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Metadata scrubbing
// ---------------------------------------------------------------------------

/**
 * Key fragments that must never appear in audit metadata. Matching is done on
 * the lowercased key, so `contactEmail` and `invited_email` are both caught.
 */
const DENIED_KEY_FRAGMENTS = [
  "email",
  "mail",
  "address",
  "phone",
  "name",
  "token",
  "secret",
  "password",
  "credential",
  "authorization",
  "cookie",
  "apikey",
  "identifier",
  "value",
  "plaintext",
  "body",
  "subject",
  "ip",
  "useragent",
  "signature",
  "dob",
  "birth",
] as const;

/**
 * Keys that are safe even though they contain a denied fragment, because they
 * only ever carry a masked preview, a blind index or an enum value.
 */
const ALLOWED_KEYS = new Set(
  [
    "maskedEmail",
    "maskedRecipient",
    "maskedPhone",
    "maskedName",
    "maskedPreview",
    "emailIndex",
    "emailPurpose",
    "emailProvider",
    "emailStatus",
    "identifierType",
    "identifierCount",
    "resourceName",
    "settingKey",
    "subjectHash",
    "bodyHash",
    "tokenHash",
    "ipHash",
    "userAgentHash",
    "signatureVerified",
  ].map((key) => key.toLowerCase())
);

/** Values shaped like an identifier are dropped regardless of their key. */
const EMAIL_LIKE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
const PHONE_LIKE = /(?:\+|\b00)\d[\d\s()-]{6,}/;
const LONG_OPAQUE_TOKEN = /^[A-Za-z0-9_-]{40,}$/;

const MAX_METADATA_KEYS = 30;
const MAX_STRING_LENGTH = 200;

export interface ScrubResult {
  metadata: Record<string, unknown>;
  /** Keys that were removed, so the audit row documents the redaction. */
  redactedKeys: string[];
}

function isDeniedKey(key: string): boolean {
  const normalised = key.toLowerCase();
  if (ALLOWED_KEYS.has(normalised)) {
    return false;
  }
  return DENIED_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

function looksSensitive(value: string): boolean {
  return (
    EMAIL_LIKE.test(value) || PHONE_LIKE.test(value) || LONG_OPAQUE_TOKEN.test(value)
  );
}

/**
 * `safeMeta()` style allow listing for audit metadata: only primitives, dates
 * and short string arrays survive, denied keys are dropped and any value that
 * looks like personal data is dropped even when its key looks harmless.
 */
export function scrubAuditMetadata(input: Record<string, unknown>): ScrubResult {
  const metadata: Record<string, unknown> = {};
  const redactedKeys: string[] = [];

  for (const [key, value] of Object.entries(input)) {
    if (Object.keys(metadata).length >= MAX_METADATA_KEYS) {
      redactedKeys.push(key);
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    if (isDeniedKey(key)) {
      redactedKeys.push(key);
      continue;
    }

    if (typeof value === "string") {
      if (looksSensitive(value)) {
        redactedKeys.push(key);
        continue;
      }
      metadata[key] =
        value.length > MAX_STRING_LENGTH
          ? `${value.slice(0, MAX_STRING_LENGTH)}...`
          : value;
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      metadata[key] = value;
      continue;
    }

    if (value instanceof Date) {
      metadata[key] = value.toISOString();
      continue;
    }

    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      const strings = value.slice(0, 20);
      if (strings.some((item) => looksSensitive(item))) {
        redactedKeys.push(key);
        continue;
      }
      metadata[key] = strings.map((item) =>
        item.length > MAX_STRING_LENGTH ? `${item.slice(0, MAX_STRING_LENGTH)}...` : item
      );
      continue;
    }

    // Objects, functions and everything else is structurally unsafe.
    redactedKeys.push(key);
  }

  if (redactedKeys.length > 0) {
    metadata.redactedKeys = redactedKeys.slice(0, 20);
  }

  return { metadata, redactedKeys };
}

// ---------------------------------------------------------------------------
// Actor normalisation and canonical payload
// ---------------------------------------------------------------------------

interface NormalisedActor {
  actorType: ActorType;
  actorUserId: string | null;
  actorRole: UserRole | null;
  requestId: string;
  ipHash: string | null;
  userAgentHash: string | null;
  fallbackTargetUserId: string | null;
}

function isAnonymousActor(actor: AuditActor): actor is AnonymousAuditActor {
  return "kind" in actor && actor.kind === "anonymous";
}

function normaliseActor(actor: AuditActor): NormalisedActor {
  if (isAnonymousActor(actor)) {
    return {
      actorType: "SYSTEM",
      actorUserId: null,
      actorRole: null,
      requestId: actor.requestId,
      ipHash: actor.ipHash,
      userAgentHash: actor.userAgentHash,
      fallbackTargetUserId: actor.subjectUserId,
    };
  }

  const actorType: ActorType = actor.isSystem
    ? "SYSTEM"
    : actor.role === "INSTANCE_ADMIN"
      ? "ADMIN"
      : "USER";

  return {
    actorType,
    actorUserId: actor.isSystem ? null : actor.userId,
    actorRole: actor.role,
    requestId: actor.requestId,
    ipHash: actor.ipHash,
    userAgentHash: actor.userAgentHash,
    fallbackTargetUserId: null,
  };
}

/**
 * Canonical hash input. Deliberately excludes `id`, `sequence` and request
 * context so that the chain covers the meaning of an event, not its storage
 * details.
 */
export function auditCanonicalPayload(fields: {
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  targetUserId: string | null;
  outcome: AuditOutcome;
  createdAt: Date;
  metadata: unknown;
}): string {
  return canonicalJson({
    action: fields.action,
    resourceType: fields.resourceType,
    resourceId: fields.resourceId,
    actorUserId: fields.actorUserId,
    targetUserId: fields.targetUserId,
    outcome: fields.outcome,
    createdAt: fields.createdAt,
    metadata: fields.metadata,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Writes one audit row. Returns null when the write failed, which is logged as
 * an error. Callers that must not continue without an audit entry use
 * `recordAuditOrThrow()`.
 */
export async function recordAudit(input: RecordAuditInput): Promise<AuditEntry | null> {
  try {
    return await recordAuditOrThrow(input);
  } catch (error) {
    log.error(
      { action: input.action, resourceType: input.resourceType, err: error },
      "Failed to write audit entry"
    );
    return null;
  }
}

export async function recordAuditOrThrow(input: RecordAuditInput): Promise<AuditEntry> {
  if (!isAuditAction(input.action)) {
    throw new Error(
      `Unknown audit action "${String(input.action)}". Add it to lib/audit/actions.ts first.`
    );
  }

  const actor = normaliseActor(input.actor);
  const { metadata } = scrubAuditMetadata(input.metadata ?? {});
  const createdAt = new Date();
  const outcome: AuditOutcome = input.outcome ?? "SUCCESS";
  const resourceId = input.resourceId ?? null;
  const targetUserId =
    input.targetUserId ?? actor.fallbackTargetUserId ?? actor.actorUserId ?? null;

  const entry = await appendAuditLog(
    {
      actorType: actor.actorType,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: input.action,
      resourceType: input.resourceType,
      resourceId,
      targetUserId,
      outcome,
      reason: input.reason ?? null,
      ipHash: actor.ipHash,
      userAgentHash: actor.userAgentHash,
      requestId: actor.requestId,
      metadata,
      createdAt,
    },
    (previousHash) =>
      chainHash(
        previousHash,
        auditCanonicalPayload({
          action: input.action,
          resourceType: input.resourceType,
          resourceId,
          actorUserId: actor.actorUserId,
          targetUserId,
          outcome,
          createdAt,
          metadata,
        })
      )
  );

  log.debug(
    {
      action: input.action,
      resourceType: input.resourceType,
      outcome,
      sequence: Number(entry.sequence),
    },
    "Audit entry written"
  );

  return entry;
}

/** Convenience wrapper for the `security.*` actions. */
export async function recordSecurityEvent(input: {
  actor: AuditActor;
  action: Extract<AuditAction, `security.${string}`>;
  resourceType?: AuditResourceType;
  resourceId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<AuditEntry | null> {
  return recordAudit({
    actor: input.actor,
    action: input.action,
    resourceType: input.resourceType ?? "instance",
    resourceId: input.resourceId ?? null,
    outcome: "DENIED",
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  });
}

export interface AuditChainProblem {
  auditLogId: string;
  sequence: number;
  problem: "hash_mismatch" | "broken_link";
  expectedHash: string;
  storedHash: string;
}

export interface AuditChainVerification {
  checked: number;
  valid: boolean;
  firstProblem: AuditChainProblem | null;
}

function recomputeHash(previousHash: string | null, row: AuditChainRow): string {
  return chainHash(
    previousHash,
    auditCanonicalPayload({
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      actorUserId: row.actorUserId,
      targetUserId: row.targetUserId,
      outcome: row.outcome,
      createdAt: row.createdAt,
      metadata: row.metadata,
    })
  );
}

/**
 * Recomputes the chain and returns the first inconsistency. Used by the admin
 * console and by the integration tests. Without a limit the whole table is
 * verified; with a limit only the newest `limit` rows are checked, anchored on
 * the hash of the row before the window.
 */
export async function verifyAuditChain(limit?: number): Promise<AuditChainVerification> {
  const { rows, previousHash } = await listAuditChainWindow(limit);

  let expectedPrevHash = previousHash;

  for (const [index, row] of rows.entries()) {
    if (row.prevHash !== expectedPrevHash) {
      return {
        checked: index + 1,
        valid: false,
        firstProblem: {
          auditLogId: row.id,
          sequence: Number(row.sequence),
          problem: "broken_link",
          expectedHash: expectedPrevHash ?? "genesis",
          storedHash: row.prevHash ?? "genesis",
        },
      };
    }

    const expectedHash = recomputeHash(expectedPrevHash, row);
    if (expectedHash !== row.hash) {
      return {
        checked: index + 1,
        valid: false,
        firstProblem: {
          auditLogId: row.id,
          sequence: Number(row.sequence),
          problem: "hash_mismatch",
          expectedHash,
          storedHash: row.hash,
        },
      };
    }

    expectedPrevHash = row.hash;
  }

  return { checked: rows.length, valid: true, firstProblem: null };
}
