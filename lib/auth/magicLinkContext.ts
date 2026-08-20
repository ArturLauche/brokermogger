/**
 * Async context for a magic link request.
 *
 * Auth.js can be reached two ways: through our own `/login` server action and
 * directly through `POST /api/auth/signin/magic-link`. Both paths end in
 * `sendVerificationRequest`, which is therefore the only reliable place to
 * enforce the rate limit.
 *
 * To avoid counting a legitimate request twice, the server action wraps its
 * `signIn()` call in this async context and records that it already consumed the
 * limit. A direct API call has no context, so the limit is consumed inside
 * `sendVerificationRequest` instead.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface MagicLinkRequestContext {
  /** True when the caller already consumed the magic link rate limits. */
  rateLimitConsumed: boolean;
  /** Request id of the calling action, so the audit trail stays correlated. */
  requestId: string;
  ipHash: string | null;
  userAgentHash: string | null;
}

const storage = new AsyncLocalStorage<MagicLinkRequestContext>();

export async function withMagicLinkContext<T>(
  context: MagicLinkRequestContext,
  handler: () => Promise<T>
): Promise<T> {
  return storage.run(context, handler);
}

export function currentMagicLinkContext(): MagicLinkRequestContext | undefined {
  return storage.getStore();
}
