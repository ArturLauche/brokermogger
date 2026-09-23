import type { PrismaTransaction } from "@/lib/db/client";
import { appendConsentRecordInTx } from "./consent";
import { applyRequestStatusInTx } from "./requests";

/** Called under the account lock. Revoke dispatch authority, including a claimed job. */
export async function invalidateProfileApprovalsInTx(
  tx: PrismaTransaction,
  profileId: string,
  message: string,
  identifierId?: string
) {
  const requests = await tx.removalRequest.findMany({
    where: {
      profileId,
      deletedAt: null,
      ...(identifierId ? { includedIdentifierIds: { has: identifierId } } : {}),
    },
    orderBy: { id: "asc" },
    select: { id: true, status: true },
  });
  for (const request of requests) {
    if (request.status === "APPROVED")
      await applyRequestStatusInTx(tx, {
        requestId: request.id,
        from: "APPROVED",
        to: "NEEDS_USER_ACTION",
        actor: "SYSTEM",
        actorUserId: null,
        message,
        cancelPendingJobTypes: ["SEND_REQUEST", "PREPARE_FOLLOW_UP"],
      });
    if (request.status === "FOLLOW_UP_SCHEDULED")
      await applyRequestStatusInTx(tx, {
        requestId: request.id,
        from: "FOLLOW_UP_SCHEDULED",
        to: "WAITING_FOR_BROKER",
        actor: "SYSTEM",
        actorUserId: null,
        message,
        cancelPendingJobTypes: ["PREPARE_FOLLOW_UP"],
      });
  }
  const ids = requests.map((row) => row.id);
  await tx.backgroundJob.updateMany({
    where: {
      relatedRequestId: { in: ids },
      type: { in: ["SEND_REQUEST", "PREPARE_FOLLOW_UP"] },
      status: { in: ["PENDING", "RETRYABLE", "RUNNING"] },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      leaseToken: null,
      lockedAt: null,
      lockedBy: null,
      lockExpiresAt: null,
      lastError: message,
    },
  });
  await tx.outboundEmail.updateMany({
    where: { removalRequestId: { in: ids }, dispatchState: "PREPARED" },
    data: { dispatchState: "CANCELLED" },
  });
  await tx.outboundEmail.updateMany({
    where: {
      removalRequestId: { in: ids },
      dispatchState: { in: ["DISPATCHING", "AMBIGUOUS"] },
    },
    data: { dispatchState: "RECONCILIATION_REQUIRED" },
  });
  await tx.removalRequest.updateMany({
    where: { id: { in: ids } },
    data: {
      approvedSnapshotId: null,
      approvedEnvelopeHash: null,
      approvalConsentRecordId: null,
    },
  });
}

export async function revokeProfileConsentInTx(
  tx: PrismaTransaction,
  profileId: string,
  ownerUserId: string,
  reason: string
) {
  await tx.$executeRaw`SELECT 1 FROM "UserProfile" WHERE id = ${profileId} FOR UPDATE`;
  const current = await tx.householdConsent.findFirst({
    where: { profileId, status: { in: ["PENDING", "VERIFIED"] } },
    orderBy: { createdAt: "desc" },
  });
  await tx.householdConsent.updateMany({
    where: { profileId, status: { in: ["PENDING", "VERIFIED"] } },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  await tx.householdMember.updateMany({
    where: { profileId },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  await tx.userProfile.update({
    where: { id: profileId },
    data: { consentStatus: "NOT_ALLOWED" },
  });
  await invalidateProfileApprovalsInTx(tx, profileId, reason);
  if (current)
    await appendConsentRecordInTx(tx, {
      profileId,
      actorUserId: ownerUserId,
      purpose: "PROFILE_MANAGEMENT",
      method: "DOUBLE_OPT_IN_EMAIL",
      status: "NOT_ALLOWED",
      householdConsentId: current.id,
      statementText: reason,
    });
}
