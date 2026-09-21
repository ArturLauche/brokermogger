/** Erase personal content while retaining pseudonymous consent parent records. */
import { NotFoundError } from "@/lib/core/errors";
import { prisma, withAppendOnlyDeletes } from "@/lib/db/client";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { randomUUID } from "node:crypto";
import { parseJobPayload } from "@/lib/jobs/payloads";

export async function eraseProfileContent(
  actor: ActorContext,
  profileId: string,
  identifierId?: string
): Promise<void> {
  const profile = await prisma.userProfile.findFirst({
    where: { id: profileId, deletedAt: null },
    select: { ownerUserId: true },
  });
  if (!profile) throw new NotFoundError("This profile does not exist.");
  requirePermission(actor, identifierId ? "identifier:write" : "profile:delete", {
    ownerUserId: profile.ownerUserId,
  });
  await withAppendOnlyDeletes(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${profile.ownerUserId} FOR UPDATE`;
    if (
      identifierId &&
      !(await tx.profileIdentifier.findFirst({
        where: { id: identifierId, profileId, deletedAt: null },
        select: { id: true },
      }))
    )
      throw new NotFoundError("This identifier does not exist.");
    const requests = await tx.removalRequest.findMany({
      where: {
        profileId,
        ...(identifierId ? { includedIdentifierIds: { has: identifierId } } : {}),
      },
      select: { id: true },
    });
    const requestIds = requests.map((request) => request.id);
    await tx.backgroundJob.updateMany({
      where: {
        relatedRequestId: { in: requestIds },
        status: { in: ["PENDING", "RETRYABLE", "RUNNING"] },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
        lastError: "Personal data erased by its owner.",
      },
    });
    await tx.profileIdentifier.deleteMany({
      where: { profileId, ...(identifierId ? { id: identifierId } : {}) },
    });
    await tx.requestSnapshot.deleteMany({
      where: { removalRequestId: { in: requestIds } },
    });
    await tx.removalRequestEvent.deleteMany({
      where: { removalRequestId: { in: requestIds } },
    });
    await tx.brokerResponse.deleteMany({
      where: { removalRequestId: { in: requestIds } },
    });
    await tx.emailWebhookEvent.deleteMany({
      where: { outboundEmail: { removalRequestId: { in: requestIds } } },
    });
    await tx.outboundEmail.deleteMany({
      where: { removalRequestId: { in: requestIds } },
    });
    await tx.notification.deleteMany({
      where: {
        OR: [
          { removalRequestId: { in: requestIds } },
          ...(!identifierId ? [{ profileId }] : []),
        ],
      },
    });
    // Reports may include content from more than one profile; invalidate derived copies.
    await tx.report.deleteMany({ where: { userId: profile.ownerUserId } });
    await tx.evidenceFile.updateMany({
      where: {
        userId: profile.ownerUserId,
        storageState: { not: "PURGED" },
        OR: [
          { removalRequestId: { in: requestIds } },
          { kind: "REPORT" },
          ...(!identifierId ? [{ profileId }] : []),
        ],
      },
      data: {
        storageState: "PURGE_PENDING",
        purgeRequestedAt: new Date(),
        deletedAt: new Date(),
        filenameEnc: null,
        filenameMasked: null,
        metadata: {},
      },
    });
    await tx.removalRequest.updateMany({
      where: { id: { in: requestIds } },
      data: {
        deletedAt: new Date(),
        currentSnapshotId: null,
        includedIdentifierIds: [],
        includedIdentifiers: [],
        metadata: {},
        externalReference: null,
        closureReason: null,
        nextFollowUpAt: null,
      },
    });
    await tx.backgroundJob.create({
      data: {
        type: "PURGE_EVIDENCE",
        payloadJson: parseJobPayload("PURGE_EVIDENCE", {
          olderThanIso: new Date().toISOString(),
        }),
        idempotencyKey: `erasure-files:${randomUUID()}`,
        relatedUserId: profile.ownerUserId,
        priority: 10,
      },
    });
    if (!identifierId) {
      await tx.householdConsent.updateMany({
        where: { profileId },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          contactEmailEnc: "",
          contactEmailBi: "",
          contactEmailMasked: "",
          scope: {},
          verificationIpHash: null,
          verificationUserAgentHash: null,
        },
      });
      await tx.householdMember.updateMany({
        where: { profileId },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          deletedAt: new Date(),
          invitedEmailEnc: null,
          invitedEmailBi: null,
          invitedEmailMasked: null,
          addedReason: null,
        },
      });
      await tx.userProfile.update({
        where: { id: profileId },
        data: {
          deletedAt: new Date(),
          displayName: "Deleted profile",
          legalNameEnc: null,
          legalNameBi: null,
          contactEmailEnc: null,
          contactEmailBi: null,
          contactEmailMasked: null,
          notes: null,
          residencyNote: null,
          region: null,
          residencyConfirmed: false,
        },
      });
    }
  });
}
