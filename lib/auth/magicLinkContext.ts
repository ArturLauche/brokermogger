/**
 * Async context for a magic link request.
 *
 * Auth.js can be reached two ways: through our own `/login` server action and
 * directly through `POST /api/auth/signin/magic-link`. Both paths end in
 * a shared gate before token issuance, with a delivery-time defence in depth.
 * The gate memoises its decision per address blind index for this request only.
 * Concurrent checks share the same promise; callers cannot mark a quota as
 * consumed. Neither request-local decisions nor identifiers survive the request.
 * A rejected promise is retained too: every check in this request fails closed
 * without retrying the transaction. After rollback, a new HTTP request may retry
 * with a fresh context; there is no cached cross-request admission or charge.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { HashedRequestContext } from "./requestContext";

export interface MagicLinkRequestContext extends HashedRequestContext {
  entryPoint: "login_form" | "auth_api";
}

const storage = new AsyncLocalStorage<{
  context: MagicLinkRequestContext;
  decisions: Map<string, Promise<boolean>>;
}>();

export async function withMagicLinkContext<T>(
  context: MagicLinkRequestContext,
  handler: () => Promise<T>
): Promise<T> {
  return storage.run({ context, decisions: new Map() }, handler);
}

export function currentMagicLinkContext(): MagicLinkRequestContext | undefined {
  return storage.getStore()?.context;
}

export function oncePerMagicLinkRequest(
  subjectKey: string,
  check: () => Promise<boolean>
): Promise<boolean> {
  const request = storage.getStore();
  if (!request) return check();
  const previous = request.decisions.get(subjectKey);
  if (previous) return previous;
  const decision = check();
  request.decisions.set(subjectKey, decision);
  return decision;
}
