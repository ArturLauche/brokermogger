/**
 * Application level cryptography.
 *
 * Encryption: AES-256-GCM with a key ring. Every ciphertext records the key id
 * so that keys can be rotated without a bulk re-encryption. Additional
 * authenticated data binds a ciphertext to the table, column and record it
 * belongs to, which prevents copying a value from one row into another.
 *
 * Blind index: HMAC-SHA256 over a normalised value. It allows equality lookups
 * and uniqueness constraints without storing the plaintext. It is deliberately
 * not reversible and not suitable for prefix or fuzzy search.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { env } from "@/lib/config/env";
import { AppError } from "@/lib/core/errors";

const ENVELOPE_PREFIX = "bm1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface EncryptionContext {
  /** Prisma model name, e.g. "ProfileIdentifier". */
  table: string;
  /** Column name, e.g. "valueEnc". */
  column: string;
  /** Owning record id. Use a stable surrogate when the id is not known yet. */
  recordId: string;
}

function buildAad(context: EncryptionContext): Buffer {
  return Buffer.from(`${context.table}|${context.column}|${context.recordId}`, "utf8");
}

function keyForId(keyId: string): Buffer {
  const entry = env.encryptionKeyring.find((candidate) => candidate.keyId === keyId);
  if (!entry) {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "Stored data references an encryption key that is not configured.",
      details: { keyId },
    });
  }
  return entry.key;
}

/**
 * Encrypts a UTF-8 string.
 * Envelope format: bm1.<keyId>.<base64url iv>.<base64url ciphertext>.<base64url tag>
 */
export function encryptField(plaintext: string, context: EncryptionContext): string {
  const { keyId, key } = env.encryptionActiveKey;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(buildAad(context));

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENVELOPE_PREFIX,
    keyId,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptField(envelope: string, context: EncryptionContext): string {
  const parts = envelope.split(".");
  if (parts.length !== 5 || parts[0] !== ENVELOPE_PREFIX) {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "Encrypted value has an unexpected format.",
    });
  }

  const [, keyId, ivPart, ciphertextPart, tagPart] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];

  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyForId(keyId),
    Buffer.from(ivPart, "base64url"),
    { authTagLength: TAG_BYTES }
  );
  decipher.setAAD(buildAad(context));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "Encrypted value failed authentication. It may have been tampered with.",
      details: { keyId, table: context.table, column: context.column },
    });
  }
}

export function tryDecryptField(
  envelope: string | null | undefined,
  context: EncryptionContext
): string | null {
  if (!envelope) return null;
  try {
    return decryptField(envelope, context);
  } catch {
    return null;
  }
}

/** Returns the key id a ciphertext was produced with, for rotation reporting. */
export function envelopeKeyId(envelope: string): string | null {
  const parts = envelope.split(".");
  return parts.length === 5 && parts[0] === ENVELOPE_PREFIX ? (parts[1] ?? null) : null;
}

export function needsKeyRotation(envelope: string): boolean {
  const keyId = envelopeKeyId(envelope);
  return keyId !== null && keyId !== env.encryptionActiveKey.keyId;
}

/**
 * Normalises a value before hashing so that equality is stable:
 * lowercase, collapsed whitespace, trimmed. Email and phone get extra handling.
 */
export function normaliseForIndex(
  value: string,
  type: "email" | "phone" | "text"
): string {
  const trimmed = value.trim().toLowerCase();

  if (type === "email") {
    return trimmed;
  }

  if (type === "phone") {
    const digits = trimmed.replace(/[^\d+]/g, "");
    return digits.startsWith("+") ? digits : digits.replace(/^0+/, "");
  }

  return trimmed.replace(/\s+/g, " ");
}

export function blindIndex(
  value: string,
  scope: string,
  type: "email" | "phone" | "text" = "text"
): string {
  const normalised = normaliseForIndex(value, type);
  return createHmac("sha256", env.blindIndexKey)
    .update(`${scope}|${normalised}`, "utf8")
    .digest("base64url");
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Hashes request context (IP, user agent) so audit records stay pseudonymous. */
export function hashContextValue(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHmac("sha256", env.blindIndexKey)
    .update(`context|${value}`)
    .digest("base64url");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.byteLength !== bufferB.byteLength) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

export function randomToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/**
 * Hash chain helper used by AuditLog, RemovalRequestEvent, RequestSnapshot and
 * ConsentRecord. The payload must be a deterministic, canonical string.
 */
export function chainHash(previousHash: string | null, canonicalPayload: string): string {
  return createHash("sha256")
    .update(`${previousHash ?? "genesis"}|${canonicalPayload}`, "utf8")
    .digest("hex");
}

/** Stable JSON stringify with sorted keys, used as canonical hash input. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(
      entries.map(([key, entryValue]) => [key, sortValue(entryValue)])
    );
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}
