/**
 * Outbound email ledger.
 *
 * Every message the instance sends gets one `OutboundEmail` row so that a user
 * can prove what was sent, and so that delivery webhooks can be correlated
 * later. Data minimisation rules for this table:
 *
 *  - the recipient is stored encrypted, plus a masked preview for the UI and a
 *    blind index for "did we already write to this address" lookups,
 *  - the subject is stored encrypted,
 *  - the body is never stored, only a SHA-256 hash that proves the content of
 *    an approved snapshot was the content that went out.
 */
import { randomUUID } from "node:crypto";

import type { EmailProviderKind, EmailPurpose, EmailStatus } from "@prisma/client";

import {
  findOutboundEmailAttempt,
  insertOutboundEmail,
  updateOutboundEmail,
  type OutboundEmailSummary,
} from "@/lib/db/repositories/outboundEmail";
import { createLogger } from "@/lib/observability/logger";
import { blindIndex, encryptField, sha256Hex } from "@/lib/security/crypto";
import { maskEmail } from "@/lib/security/masking";
import { assertValidEmailAddress } from "@/lib/security/sanitize";

import { isOutboundAttemptComplete } from "./outboundStatus";
import type { SendResult } from "./types";

export {
  isOutboundAttemptComplete,
  outboundAttemptLeftTheInstance,
} from "./outboundStatus";

const log = createLogger("email.ledger");

const TABLE = "OutboundEmail";
const TO_COLUMN = "toAddressEnc";
const SUBJECT_COLUMN = "subjectEnc";
const TO_INDEX_SCOPE = "outbound:to";

export interface RecordQueuedEmailInput {
  purpose: EmailPurpose;
  provider: EmailProviderKind;
  toAddress: string;
  subject: string;
  body: string;
  fromAddress: string;
  replyTo?: string | null;
  removalRequestId?: string | null;
  userId?: string | null;
  profileId?: string | null;
  /** Attempt counter, part of the dedupe tuple. */
  attempt?: number;
  metadata?: Record<string, unknown>;
}

export interface LedgerEntry {
  id: string;
  toAddressMasked: string;
  toAddressHash: string;
  bodyHash: string;
  attempt: number;
}

/** Creates the QUEUED row. Call this before handing the message to a provider. */
export async function recordQueuedEmail(
  input: RecordQueuedEmailInput
): Promise<LedgerEntry> {
  const id = randomUUID();
  const address = assertValidEmailAddress(input.toAddress, "toAddress");
  const attempt = input.attempt ?? 1;

  const entry: LedgerEntry = {
    id,
    toAddressMasked: maskEmail(address),
    toAddressHash: blindIndex(address, TO_INDEX_SCOPE, "email"),
    bodyHash: sha256Hex(input.body),
    attempt,
  };

  await insertOutboundEmail({
    id,
    purpose: input.purpose,
    provider: input.provider,
    status: "QUEUED",
    removalRequestId: input.removalRequestId ?? null,
    userId: input.userId ?? null,
    profileId: input.profileId ?? null,
    toAddressEnc: encryptField(address, {
      table: TABLE,
      column: TO_COLUMN,
      recordId: id,
    }),
    toAddressMasked: entry.toAddressMasked,
    toAddressHash: entry.toAddressHash,
    fromAddress: input.fromAddress,
    replyTo: input.replyTo ?? null,
    subjectEnc: encryptField(input.subject, {
      table: TABLE,
      column: SUBJECT_COLUMN,
      recordId: id,
    }),
    bodyHash: entry.bodyHash,
    attempt,
    metadata: input.metadata ?? {},
  });

  log.debug({ purpose: input.purpose, attempt }, "Outbound email queued in the ledger");

  return entry;
}

function statusFor(result: SendResult): EmailStatus {
  return result.dispatched ? "SENT" : "SUPPRESSED";
}

/** Records the provider outcome on an existing ledger row. */
export async function recordSendResult(
  id: string,
  result: SendResult,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await updateOutboundEmail(id, {
    status: statusFor(result),
    providerMessageId: result.providerMessageId,
    sentAt: result.sentAt,
    metadata: {
      ...metadata,
      dispatched: result.dispatched,
      ...(result.suppressionReason === undefined
        ? {}
        : { suppressionReason: result.suppressionReason }),
    },
  });
}

/** Records a failed send. The stored error is short and free of personal data. */
export async function recordSendFailure(
  id: string,
  reason: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await updateOutboundEmail(id, {
    status: "FAILED",
    failedAt: new Date(),
    lastError: reason.slice(0, 500),
    metadata,
  });
}

/** Puts a failed ledger row back to QUEUED so the unique tuple can be retried. */
export async function reopenFailedOutboundEmail(id: string): Promise<void> {
  await updateOutboundEmail(id, {
    status: "QUEUED",
    failedAt: null,
    lastError: null,
  });
}

/**
 * Send deduplication for broker correspondence. True when the tuple
 * `(removalRequestId, purpose, attempt)` already reached a terminal provider
 * outcome, so the caller must not send again.
 */
export async function hasAlreadySent(
  removalRequestId: string,
  purpose: EmailPurpose,
  attempt: number
): Promise<boolean> {
  const existing = await findOutboundEmailAttempt(removalRequestId, purpose, attempt);
  if (!existing) {
    return false;
  }

  return isOutboundAttemptComplete(existing.status);
}

export async function findSendAttempt(
  removalRequestId: string,
  purpose: EmailPurpose,
  attempt: number
): Promise<OutboundEmailSummary | null> {
  return findOutboundEmailAttempt(removalRequestId, purpose, attempt);
}
