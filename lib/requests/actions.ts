import { recordAudit } from "@/lib/audit/service";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";

import { transition } from "./transitions";
export async function returnRequestToDraft(actor: ActorContext, requestId: string) {
  requirePermission(actor, "request:update", { ownerUserId: actor.userId });
  const request = await getOwnedRequest(actor, requestId);
  requirePermission(actor, "request:update", { ownerUserId: request.userId });
  await transition(
    actor,
    request.id,
    request.status,
    "DRAFT",
    "Returned to draft by the account holder."
  );
  await recordAudit({
    actor,
    action: "request.approval_rejected",
    resourceType: "removal_request",
    resourceId: request.id,
  });
  return { requestId: request.id };
}

export async function closeRequest(actor: ActorContext, requestId: string) {
  requirePermission(actor, "request:close", { ownerUserId: actor.userId });
  const request = await getOwnedRequest(actor, requestId);
  requirePermission(actor, "request:close", { ownerUserId: request.userId });
  await transition(
    actor,
    request.id,
    request.status,
    "CLOSED",
    "Closed by the account holder."
  );
  await recordAudit({
    actor,
    action: "request.closed",
    resourceType: "removal_request",
    resourceId: request.id,
  });
  return { requestId: request.id };
}

export async function markRequestCompleted(actor: ActorContext, requestId: string) {
  requirePermission(actor, "request:update", { ownerUserId: actor.userId });
  const request = await getOwnedRequest(actor, requestId);
  requirePermission(actor, "request:update", { ownerUserId: request.userId });
  await transition(
    actor,
    request.id,
    request.status,
    "COMPLETED",
    "The account holder marked this request completed."
  );
  await recordAudit({
    actor,
    action: "request.status_changed",
    resourceType: "removal_request",
    resourceId: request.id,
    metadata: { to: "COMPLETED" },
  });
  return { requestId: request.id };
}
