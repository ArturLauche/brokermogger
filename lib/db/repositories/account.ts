/**
 * Account-level reads and writes for the signed-in user.
 */
import { z } from "zod";
import { timezoneSchema } from "@/lib/profiles/validation";
import { parseWithSchema } from "@/lib/validation/form";
import { lockActiveAccount } from "./access";
import { NotFoundError, ValidationError } from "@/lib/core/errors";
import { prisma, withAppendOnlyDeletes } from "@/lib/db/client";
import { parseJobPayload } from "@/lib/jobs/payloads";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { readAccountEmail, verificationEmailIndex } from "@/lib/security/accountEmail";

export async function getOwnedAccount(actor: ActorContext) {
  requirePermission(actor, "account:read", { ownerUserId: actor.userId });
  const account = await prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    include: {
      sessions: {
        orderBy: { expires: "desc" },
        select: { id: true, expires: true, createdAt: true },
      },
      quota: true,
    },
  });
  return readAccountEmail(account);
}

export const accountSettingsSchema = z.object({
  name: z.string().trim().max(80),
  timezone: timezoneSchema,
});
export async function updateOwnedAccount(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "account:read", { ownerUserId: actor.userId });
  const input = parseWithSchema(accountSettingsSchema, raw);
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, actor.userId);
    return tx.user.update({ where: { id: actor.userId }, data: input });
  });
}

export async function revokeSession(actor: ActorContext, sessionId: string) {
  requirePermission(actor, "account:read", { ownerUserId: actor.userId });
  return prisma.session.deleteMany({
    where: { id: sessionId, userId: actor.userId },
  });
}

export async function markAccountDeletionRequested(actor: ActorContext) {
  requirePermission(actor, "account:delete", { ownerUserId: actor.userId });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${actor.userId} FOR UPDATE`;
    const account = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (account.anonymizedAt) return account;
    const requestedAt = account.deletionRequestedAt ?? new Date();
    const email = readAccountEmail(account).email;
    const updated = await tx.user.update({
      where: { id: actor.userId },
      data: { status: "PENDING_DELETION", deletionRequestedAt: requestedAt },
    });
    await tx.session.deleteMany({ where: { userId: actor.userId } });
    await tx.verificationToken.deleteMany({
      where: { identifier: { in: [email, verificationEmailIndex(email)] } },
    });
    const requests = await tx.removalRequest.findMany({
      where: { userId: actor.userId },
      select: { id: true },
    });
    await tx.backgroundJob.updateMany({
      where: {
        OR: [
          { relatedUserId: actor.userId },
          { relatedRequestId: { in: requests.map((request) => request.id) } },
        ],
        type: { not: "DELETE_ACCOUNT_DATA" },
        status: { in: ["PENDING", "RETRYABLE", "RUNNING"] },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: requestedAt,
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        leaseToken: null,
        lastError: "Account deletion requested.",
      },
    });
    await tx.backgroundJob.upsert({
      where: { idempotencyKey: `delete-account:${actor.userId}` },
      create: {
        type: "DELETE_ACCOUNT_DATA",
        relatedUserId: actor.userId,
        payloadJson: parseJobPayload("DELETE_ACCOUNT_DATA", {
          userId: actor.userId,
          requestedAt: requestedAt.toISOString(),
        }),
        idempotencyKey: `delete-account:${actor.userId}`,
        priority: 10,
      },
      update: {},
    });
    return updated;
  });
}

export async function findAccountCreatedAt(userId: string): Promise<Date | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

/**
 * Erase personal database content after the owner requested deletion.
 * Requires an authorized actor (the worker passes `systemActor`) and only
 * proceeds when that same account has `deletionRequestedAt` set.
 * Snapshot/event deletion uses the retention escape hatch. The worker must
 * subsequently purge every stored object and call finishAccountErasure.
 */
export async function anonymiseDeletedAccount(
  actor: ActorContext,
  userId: string
): Promise<void> {
  requirePermission(actor, "account:delete", { ownerUserId: userId });

  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletionRequestedAt: true, anonymizedAt: true },
  });
  if (!account) {
    throw new NotFoundError("This account does not exist.");
  }
  if (!account.deletionRequestedAt) {
    throw new ValidationError("Account deletion has not been requested.");
  }
  if (account.anonymizedAt) {
    return;
  }

  await withAppendOnlyDeletes(async (tx) => {
    await tx.profileIdentifier.deleteMany({
      where: { profile: { ownerUserId: userId } },
    });
    await tx.manualSubmission.deleteMany({ where: { removalRequest: { userId } } });
    await tx.requestSnapshot.deleteMany({ where: { removalRequest: { userId } } });
    await tx.removalRequestEvent.deleteMany({ where: { removalRequest: { userId } } });
    await tx.brokerResponse.deleteMany({ where: { userId } });
    await tx.inboundMailbox.deleteMany({ where: { userId } });
    await tx.emailWebhookEvent.deleteMany({
      where: { OR: [{ ownerUserId: userId }, { outboundEmail: { userId } }] },
    });
    await tx.outboundEmail.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.report.deleteMany({ where: { userId } });
    await tx.accountExport.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.evidenceFile.updateMany({
      where: { userId, storageState: { not: "PURGED" } },
      data: {
        storageState: "PURGE_PENDING",
        deletedAt: new Date(),
        purgeRequestedAt: new Date(),
        filenameEnc: null,
        filenameMasked: null,
        metadata: {},
      },
    });
    await tx.removalRequest.updateMany({
      where: { userId },
      data: {
        deletedAt: new Date(),
        includedIdentifierIds: [],
        includedIdentifiers: [],
        currentSnapshotId: null,
        metadata: {},
        closureReason: null,
        externalReference: null,
        nextFollowUpAt: null,
        deadlineAt: null,
        deadlineOn: null,
        deadlineAnchorOn: null,
        deadlineBasis: null,
        deadlineSnapshotId: null,
        deadlineTimezone: null,
        deadlineNote: null,
        deadlinePolicyVersion: null,
        deadlineWarningForAt: null,
        deadlineHandledForAt: null,
        deadlineHandledFollowUpCount: null,
      },
    });
    await tx.householdConsent.updateMany({
      where: { requestedByUserId: userId },
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
      where: { ownerUserId: userId },
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
    await tx.userProfile.updateMany({
      where: { ownerUserId: userId },
      data: {
        deletedAt: new Date(),
        legalNameEnc: null,
        legalNameBi: null,
        contactEmailEnc: null,
        contactEmailBi: null,
        contactEmailMasked: null,
        notes: null,
        residencyNote: null,
        region: null,
        residencyConfirmed: false,
        displayName: "Deleted profile",
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        name: null,
        image: null,
        emailEnc: null,
        emailBi: null,
        preferences: {},
        email: `deleted-${userId}@anonymised.invalid`,
      },
    });
    await tx.backgroundJob.updateMany({
      where: {
        relatedUserId: userId,
        type: { not: "DELETE_ACCOUNT_DATA" },
        status: { in: ["PENDING", "RETRYABLE", "RUNNING"] },
      },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
  });
}

export async function listAccountFilesForErasure(userId: string, take = 100) {
  return prisma.evidenceFile.findMany({
    where: { userId, storageState: { not: "PURGED" } },
    take,
    orderBy: { id: "asc" },
  });
}

export async function finishAccountErasure(
  actor: ActorContext,
  userId: string
): Promise<void> {
  requirePermission(actor, "account:delete", { ownerUserId: userId });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (
      await tx.evidenceFile.count({ where: { userId, storageState: { not: "PURGED" } } })
    ) {
      throw new ValidationError(
        "Stored files still await deletion. Cleanup will resume."
      );
    }
    // File tombstones are useful during recovery, but are not retained consent or audit proof.
    // Remove their keys, checksums, sizes and relationship metadata only after every purge succeeds.
    await tx.evidenceFile.deleteMany({ where: { userId, storageState: "PURGED" } });
    await tx.userQuota.deleteMany({ where: { userId } });
    await tx.user.updateMany({
      where: {
        id: userId,
        status: "PENDING_DELETION",
        deletionRequestedAt: { not: null },
      },
      data: { status: "DELETED", anonymizedAt: new Date(), deletedAt: new Date() },
    });
  });
}
