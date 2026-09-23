/**
 * Central authorization policy.
 *
 * Every access decision in the product is made here. UI code may use `can()`
 * to hide affordances, but the same call must always run on the server before
 * the operation executes. There is deliberately no second implementation.
 *
 * Role model:
 *   USER            owns profiles, identifiers, requests, evidence, reports
 *   MAINTAINER      USER rights on own data plus broker, legal rule and
 *                   template curation. Never sees other users' data.
 *   INSTANCE_ADMIN  operations: jobs, settings, audit, manual review queue.
 *                   Access to another user's data requires an active
 *                   break-glass grant and always creates an AuditLog entry.
 *                   Decrypted identifiers and identity documents stay blocked.
 */
import { ForbiddenError } from "@/lib/core/errors";

import { hasActiveGrant, type ActorContext } from "./actor";

export const ACTIONS = [
  "profile:read",
  "profile:create",
  "profile:update",
  "profile:delete",
  "identifier:read",
  "identifier:reveal",
  "identifier:write",
  "household:read",
  "household:manage",
  "consent:read",
  "consent:grant",
  "consent:revoke",
  "request:read",
  "request:create",
  "request:update",
  "request:approve",
  "request:send",
  "request:close",
  "evidence:read",
  "evidence:download",
  "evidence:upload",
  "evidence:delete",
  "report:read",
  "report:generate",
  "notification:read",
  "notification:update",
  "account:read",
  "account:export",
  "account:delete",
  "admin:console:access",
  "admin:broker:read",
  "admin:broker:manage",
  "admin:legalRule:read",
  "admin:legalRule:manage",
  "admin:template:read",
  "admin:template:manage",
  "admin:job:read",
  "admin:job:manage",
  "admin:audit:read",
  "admin:settings:read",
  "admin:settings:manage",
  "admin:user:list",
  "admin:user:viewSensitive",
  "admin:manualReview:read",
  "admin:manualReview:decide",
] as const;

export type Action = (typeof ACTIONS)[number];

export interface ResourceRef {
  /** Owner of the resource. Null for global resources such as brokers. */
  ownerUserId?: string | null;
  /** Stable scope key for break-glass grants, e.g. `user:clx123`. */
  scope?: string;
}

export interface Decision {
  allowed: boolean;
  reason?: string;
}

const ALLOW: Decision = { allowed: true };

function deny(reason: string): Decision {
  return { allowed: false, reason };
}

/** Actions a signed in user may perform on resources they own. */
const OWNER_ACTIONS = new Set<Action>([
  "profile:read",
  "profile:create",
  "profile:update",
  "profile:delete",
  "identifier:read",
  "identifier:reveal",
  "identifier:write",
  "household:read",
  "household:manage",
  "consent:read",
  "consent:grant",
  "consent:revoke",
  "request:read",
  "request:create",
  "request:update",
  "request:approve",
  "request:send",
  "request:close",
  "evidence:read",
  "evidence:download",
  "evidence:upload",
  "evidence:delete",
  "report:read",
  "report:generate",
  "notification:read",
  "notification:update",
  "account:read",
  "account:export",
  "account:delete",
]);

/** Curation actions available to maintainers and instance admins. */
const MAINTAINER_ACTIONS = new Set<Action>([
  "admin:console:access",
  "admin:broker:read",
  "admin:broker:manage",
  "admin:legalRule:read",
  "admin:legalRule:manage",
  "admin:template:read",
  "admin:template:manage",
]);

/** Operational actions reserved for instance admins. */
const ADMIN_ACTIONS = new Set<Action>([
  "admin:console:access",
  "admin:broker:read",
  "admin:broker:manage",
  "admin:legalRule:read",
  "admin:legalRule:manage",
  "admin:template:read",
  "admin:template:manage",
  "admin:job:read",
  "admin:job:manage",
  "admin:audit:read",
  "admin:settings:read",
  "admin:settings:manage",
  "admin:user:list",
  "admin:manualReview:read",
  "admin:manualReview:decide",
]);

/**
 * Emergency access permits only minimized, audited reads. It never grants
 * authority to change consent, approve messages, mutate or download user data.
 */
const BREAK_GLASS_READS = new Set<Action>([
  "profile:read",
  "identifier:read",
  "household:read",
  "consent:read",
  "request:read",
  "evidence:read",
  "report:read",
  "account:read",
]);

export function can(
  actor: ActorContext,
  action: Action,
  resource: ResourceRef = {}
): Decision {
  if (actor.isSystem) {
    if (action === "request:approve")
      return deny("Approval requires the account holder’s explicit confirmation.");
    return ALLOW;
  }

  const ownsResource =
    resource.ownerUserId !== undefined &&
    resource.ownerUserId !== null &&
    resource.ownerUserId === actor.userId;

  if (OWNER_ACTIONS.has(action)) {
    if (ownsResource) {
      return ALLOW;
    }

    // Creation and list operations must explicitly bind ownership to the actor.
    if (resource.ownerUserId === undefined || resource.ownerUserId === null) {
      return deny("An explicit resource owner is required.");
    }

    if (actor.role === "INSTANCE_ADMIN") {
      if (!BREAK_GLASS_READS.has(action)) {
        return deny(
          "Emergency access only permits audited, minimized reads. This action belongs to the account holder."
        );
      }

      const scope = resource.scope ?? `user:${resource.ownerUserId}`;
      if (hasActiveGrant(actor, scope)) {
        return ALLOW;
      }
      return deny("An active break-glass grant is required to access another account.");
    }

    return deny("This resource belongs to another account.");
  }

  if (action === "admin:user:viewSensitive") {
    if (actor.role !== "INSTANCE_ADMIN") {
      return deny("Only instance admins may request sensitive access.");
    }
    const scope = resource.scope ?? `user:${resource.ownerUserId ?? "unknown"}`;
    return hasActiveGrant(actor, scope)
      ? ALLOW
      : deny("An active break-glass grant is required.");
  }

  if (actor.role === "INSTANCE_ADMIN" && ADMIN_ACTIONS.has(action)) {
    return ALLOW;
  }

  if (actor.role === "MAINTAINER" && MAINTAINER_ACTIONS.has(action)) {
    return ALLOW;
  }

  return deny("Your role does not include this action.");
}

export function requirePermission(
  actor: ActorContext,
  action: Action,
  resource: ResourceRef = {}
): void {
  const decision = can(actor, action, resource);
  if (!decision.allowed) {
    throw new ForbiddenError(
      decision.reason ?? "You do not have access to this resource.",
      {
        action,
      }
    );
  }
}

/** True when the action reads another account's data and must be audited. */
export function isCrossAccountAccess(
  actor: ActorContext,
  resource: ResourceRef
): boolean {
  return (
    !actor.isSystem &&
    resource.ownerUserId !== undefined &&
    resource.ownerUserId !== null &&
    resource.ownerUserId !== actor.userId
  );
}
