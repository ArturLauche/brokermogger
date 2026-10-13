/**
 * Request context for actors and audit entries.
 *
 * This is one of the few modules under `lib/**` that touches `next/*`: building
 * an `ActorContext` requires the incoming request headers, and only the
 * framework can provide them. ESLint allows `next/*` only inside `lib/auth/**`
 * for that reason. Everything derived from a header is hashed immediately, so
 * no raw IP address or user agent string is ever passed on.
 */
import { headers } from "next/headers";
import { isIP } from "node:net";

import type { UserRole } from "@prisma/client";

import { createLogger } from "@/lib/observability/logger";
import { env } from "@/lib/config/env";
import type { ActorContext } from "@/lib/permissions/actor";
import { blindIndex, hashContextValue } from "@/lib/security/crypto";
import { currentMagicLinkContext } from "./magicLinkContext";

const log = createLogger("auth.context");

/** Blind index scope for account email addresses, shared with the audit trail. */
export const USER_EMAIL_INDEX_SCOPE = "user:email";

export interface HashedRequestContext {
  requestId: string;
  ipHash: string | null;
  userAgentHash: string | null;
}

/**
 * Opt-in trust in one ingress-overwritten header. An appended forwarding chain
 * cannot prove which hop is the client, so it uses the shared unknown bucket.
 * The operator must prevent direct ingress and overwrite this header at the
 * trusted proxy; AUTH_TRUST_HOST does not establish that IP trust boundary.
 */
export function clientIpFromHeaders(
  headerList: Headers,
  trustedHeader = env.TRUSTED_PROXY_IP_HEADER
): string | null {
  if (trustedHeader === "none") return null;
  const value = headerList.get(trustedHeader)?.trim();
  if (!value || !isIP(value)) return null;
  if (isIP(value) === 4) return value;
  try {
    // URL parsing canonicalises equivalent IPv6 spellings before hashing.
    return new URL(`http://[${value}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
}

export function requestContextFromHeaders(headerList: Headers): HashedRequestContext {
  return {
    requestId: crypto.randomUUID(),
    ipHash: hashContextValue(clientIpFromHeaders(headerList)),
    userAgentHash: hashContextValue(headerList.get("user-agent")),
  };
}

/**
 * Reads and hashes the request context. Returns null hashes when there is no
 * request scope, for example inside a background job, so callers never have to
 * special case the worker.
 */
export async function readRequestContext(): Promise<HashedRequestContext> {
  const context = currentMagicLinkContext();
  if (context) return context;
  const requestId = crypto.randomUUID();

  try {
    const headerList = await headers();
    return requestContextFromHeaders(headerList);
  } catch {
    log.debug("No request scope available, continuing without request context");
    return { requestId, ipHash: null, userAgentHash: null };
  }
}

export function emailIndexFor(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }
  return blindIndex(email, USER_EMAIL_INDEX_SCOPE, "email");
}

/**
 * Builds an `ActorContext` for a signed in user. Never carries a raw email
 * address or IP: only the blind index and the hashed request context.
 */
export function buildUserActor(input: {
  userId: string;
  role: UserRole;
  email: string | null;
  sessionId: string | null;
  context: HashedRequestContext;
}): ActorContext {
  return {
    userId: input.userId,
    role: input.role,
    emailIndex: emailIndexFor(input.email),
    sessionId: input.sessionId,
    requestId: input.context.requestId,
    ipHash: input.context.ipHash,
    userAgentHash: input.context.userAgentHash,
    adminGrant: null,
    isSystem: false,
  };
}
