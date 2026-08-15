/**
 * The ActorContext is the authorization identity that flows through every
 * repository call, domain service and audit entry. It is created once per
 * request from the Auth.js session and never reconstructed from client input.
 */
import type { UserRole } from "@prisma/client";

export interface AdminGrant {
  /** AdminAction row that recorded the justification. */
  adminActionId: string;
  /** Resource the grant is limited to, e.g. "user:clx123". */
  scope: string;
  expiresAt: Date;
}

export interface ActorContext {
  userId: string;
  role: UserRole;
  /** Blind index of the account email, safe to log. */
  emailIndex: string | null;
  sessionId: string | null;
  requestId: string;
  ipHash: string | null;
  userAgentHash: string | null;
  /** Active break-glass grant, if the admin opened one for this resource. */
  adminGrant: AdminGrant | null;
  /** True for the background worker and scheduled jobs. */
  isSystem: boolean;
}

export const SYSTEM_USER_ID = "system";

export function systemActor(requestId: string): ActorContext {
  return {
    userId: SYSTEM_USER_ID,
    role: "INSTANCE_ADMIN",
    emailIndex: null,
    sessionId: null,
    requestId,
    ipHash: null,
    userAgentHash: null,
    adminGrant: null,
    isSystem: true,
  };
}

export function isAdmin(actor: ActorContext): boolean {
  return actor.role === "INSTANCE_ADMIN";
}

export function isMaintainer(actor: ActorContext): boolean {
  return actor.role === "MAINTAINER" || actor.role === "INSTANCE_ADMIN";
}

export function hasActiveGrant(
  actor: ActorContext,
  scope: string,
  now = new Date()
): boolean {
  const grant = actor.adminGrant;
  return (
    grant !== null && grant.scope === scope && grant.expiresAt.getTime() > now.getTime()
  );
}
