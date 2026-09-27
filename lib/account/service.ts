/**
 * Account export and deletion.
 */
import { recordAuditOrThrow } from "@/lib/audit/service";
import { markAccountDeletionRequested } from "@/lib/db/repositories/account";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
export { exportMaskedAccount as exportAccountData } from "@/lib/exports/service";

export async function requestAccountDeletion(actor: ActorContext) {
  requirePermission(actor, "account:delete", { ownerUserId: actor.userId });
  await recordAuditOrThrow({
    actor,
    action: "account.deletion_requested",
    resourceType: "user",
    resourceId: actor.userId,
  });
  await markAccountDeletionRequested(actor);
}
