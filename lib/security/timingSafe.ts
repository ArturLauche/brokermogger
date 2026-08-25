/**
 * Constant-time string comparison for secrets (cron tokens, metrics tokens).
 *
 * `===` short-circuits on the first differing byte and leaks length through
 * timing. This helper hashes both sides to a fixed 32-byte digest first so the
 * comparison is independent of input length, then uses `timingSafeEqual`.
 */
import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function timingSafeEqualString(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right));
}

/** True when `Authorization` is exactly `Bearer <secret>`. */
export function hasValidBearerToken(
  authorizationHeader: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!authorizationHeader || !secret) {
    return false;
  }
  return timingSafeEqualString(authorizationHeader, `Bearer ${secret}`);
}
