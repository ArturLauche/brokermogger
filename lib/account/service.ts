/**
 * Account export and deletion.
 */
import { recordAudit, recordAuditOrThrow } from "@/lib/audit/service";
import {
  getOwnedAccount,
  markAccountDeletionRequested,
} from "@/lib/db/repositories/account";
import { listProfilesForActor } from "@/lib/db/repositories/profiles";
import { listOwnedRequests } from "@/lib/db/repositories/requests";
import { enqueueJob } from "@/lib/jobs/queue";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";

export async function exportAccountData(actor: ActorContext): Promise<Buffer> {
  requirePermission(actor, "account:export", { ownerUserId: actor.userId });
  const account = await getOwnedAccount(actor);
  const profiles = await listProfilesForActor(actor);
  const requests = await listOwnedRequests(actor, null);

  await recordAudit({
    actor,
    action: "account.export_requested",
    resourceType: "user",
    resourceId: actor.userId,
  });
  await recordAudit({
    actor,
    action: "account.export_downloaded",
    resourceType: "user",
    resourceId: actor.userId,
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    account: {
      id: account.id,
      emailMasked: account.email.replace(/(^.).*(@.*$)/, "$1***$2"),
      name: account.name,
      timezone: account.timezone,
      role: account.role,
    },
    profiles: profiles.map((profile) => ({
      id: profile.id,
      displayName: profile.displayName,
      kind: profile.kind,
      countryCode: profile.countryCode,
      region: profile.region,
      consentStatus: profile.consentStatus,
    })),
    requests: requests.map((request) => ({
      id: request.id,
      broker: request.broker.legalName,
      status: request.status,
      requestType: request.requestType,
      createdAt: request.createdAt.toISOString(),
    })),
    note: "Identifiers are not included in decrypted form. Use the data vault to review masked values.",
  };

  return Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function requestAccountDeletion(actor: ActorContext) {
  requirePermission(actor, "account:delete", { ownerUserId: actor.userId });
  await markAccountDeletionRequested(actor);
  await recordAuditOrThrow({
    actor,
    action: "account.deletion_requested",
    resourceType: "user",
    resourceId: actor.userId,
  });
  await enqueueJob({
    type: "DELETE_ACCOUNT_DATA",
    payload: { userId: actor.userId, requestedAt: new Date().toISOString() },
    idempotencyKey: `delete-account:${actor.userId}`,
    relatedUserId: actor.userId,
  });
}
