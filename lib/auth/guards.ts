/**
 * Session guards.
 *
 * This module is the contract every server action, route handler, layout and
 * server component uses to obtain the current actor. It exists so that no other
 * module has to know how Auth.js stores a session.
 *
 * Rules:
 *  - The returned `ActorContext` never contains a raw email address, IP address
 *    or user agent string. Only a blind index and hashes.
 *  - A session for an account that is not ACTIVE is treated as no session, so a
 *    suspended account cannot keep working with an old cookie.
 *  - These guards answer "who is calling". They never answer "may they do it":
 *    that is `can()` / `requirePermission()` from `lib/permissions/policy.ts`.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { UserRole, UserStatus } from "@prisma/client";

import { ForbiddenError, UnauthenticatedError } from "@/lib/core/errors";
import { findActiveGrantForAdmin } from "@/lib/db/repositories/admin";
import { findSessionIdByToken } from "@/lib/db/repositories/users";
import { createLogger } from "@/lib/observability/logger";
import type { ActorContext } from "@/lib/permissions/actor";

import { nextAuth } from "./config";
import { sessionCookieName } from "./cookies";
import { buildUserActor, readRequestContext } from "./requestContext";
import { roleSatisfies } from "./roles";

const log = createLogger("auth.guards");

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  name: string | null;
  timezone: string;
}

/**
 * Reads the signed in user, including a status that is not ACTIVE, so a layout
 * can explain a suspension instead of silently signing the person out.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await nextAuth.auth();
  const user = session?.user;

  if (!user?.id || !user.email) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    name: user.name ?? null,
    timezone: user.timezone ?? "UTC",
  };
});

/**
 * Builds the `ActorContext` for the current request. Returns null when there is
 * no usable session.
 */
export const getActorContext = cache(async (): Promise<ActorContext | null> => {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }

  if (user.status !== "ACTIVE") {
    log.warn({ accountStatus: user.status }, "Ignoring session of an inactive account");
    return null;
  }

  const context = await readRequestContext();

  const actor = buildUserActor({
    userId: user.id,
    role: user.role,
    email: user.email,
    sessionId: await currentSessionId(),
    context,
  });

  if (user.role === "INSTANCE_ADMIN") {
    const grant = await findActiveGrantForAdmin(user.id);
    if (grant?.targetUserId && grant.grantExpiresAt) {
      actor.adminGrant = {
        adminActionId: grant.id,
        scope: `user:${grant.targetUserId}`,
        expiresAt: grant.grantExpiresAt,
      };
    }
  }

  return actor;
});

/** For server actions and route handlers: turns a missing session into an error. */
export async function requireActor(): Promise<ActorContext> {
  const actor = await getActorContext();
  if (!actor) {
    throw new UnauthenticatedError();
  }
  return actor;
}

/** For server components and layouts: turns a missing session into a redirect. */
export async function requireActorOrRedirect(): Promise<ActorContext> {
  const actor = await getActorContext();
  if (!actor) {
    redirect("/login");
  }
  return actor;
}

export { roleSatisfies };

export async function requireRole(role: UserRole): Promise<ActorContext> {
  const actor = await requireActor();

  if (!roleSatisfies(role, actor.role)) {
    throw new ForbiddenError("Your role does not include this area.", {
      requiredRole: role,
    });
  }

  return actor;
}

/**
 * Resolves the database id of the current session. Used for audit entries and
 * for the session list in the account settings.
 */
async function currentSessionId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(sessionCookieName())?.value;
    if (!token) {
      return null;
    }
    return await findSessionIdByToken(token);
  } catch {
    return null;
  }
}
