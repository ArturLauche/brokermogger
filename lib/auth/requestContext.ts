/**
 * Request context for actors and audit entries.
 *
 * This is one of the few modules under `lib/**` that touches `next/*`: building
 * an `ActorContext` requires the incoming request headers, and only the
 * framework can provide them. Everything derived from a header is hashed
 * immediately, so no raw IP address or user agent string is ever passed on.
 */
import { headers } from "next/headers";

import type { UserRole } from "@prisma/client";

import { createLogger } from "@/lib/observability/logger";
import type { ActorContext } from "@/lib/permissions/actor";
import { blindIndex, hashContextValue } from "@/lib/security/crypto";

const log = createLogger("auth.context");

/** Blind index scope for account email addresses, shared with the audit trail. */
export const USER_EMAIL_INDEX_SCOPE = "user:email";

export interface HashedRequestContext {
  requestId: string;
  ipHash: string | null;
  userAgentHash: string | null;
}

/** First hop of `x-forwarded-for`, falling back to `x-real-ip`. */
export function clientIpFromHeaders(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return headerList.get("x-real-ip");
}

/**
 * Reads and hashes the request context. Returns null hashes when there is no
 * request scope, for example inside a background job, so callers never have to
 * special case the worker.
 */
export async function readRequestContext(): Promise<HashedRequestContext> {
  const requestId = crypto.randomUUID();

  try {
    const headerList = await headers();
    return {
      requestId,
      ipHash: hashContextValue(clientIpFromHeaders(headerList)),
      userAgentHash: hashContextValue(headerList.get("user-agent")),
    };
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
