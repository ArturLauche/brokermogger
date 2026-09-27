/**
 * Ownership-scoped evidence files.
 */
import type { EvidenceKind, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { AppError, NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { isCrossAccountAccess, requirePermission } from "@/lib/permissions/policy";
import { recordAuditOrThrow } from "@/lib/audit/service";
import { invalidateAccountExportsInTx } from "./accountExports";
import { lockActiveAccount } from "./access";

export async function listOwnedEvidence(actor: ActorContext, profileId: string | null) {
  requirePermission(actor, "evidence:read", { ownerUserId: actor.userId });
  return prisma.evidenceFile.findMany({
    where: {
      userId: actor.userId,
      deletedAt: null,
      storageState: "READY",
      kind: { not: "ACCOUNT_EXPORT" },
      ...(profileId ? { profileId } : {}),
    },
    include: { removalRequest: { include: { broker: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getOwnedEvidence(actor: ActorContext, evidenceId: string) {
  const file = await prisma.evidenceFile.findFirst({
    where: { id: evidenceId, deletedAt: null },
  });
  if (!file) {
    throw new NotFoundError("This file does not exist.");
  }
  requirePermission(actor, "evidence:read", { ownerUserId: file.userId });
  if (isCrossAccountAccess(actor, { ownerUserId: file.userId })) {
    await recordAuditOrThrow({
      actor,
      action: "admin.user_data_viewed",
      resourceType: "evidence_file",
      resourceId: file.id,
      targetUserId: file.userId,
    });
    return { ...file, filenameEnc: null, metadata: {} };
  }
  return file;
}

export async function getOwnedEvidenceForDownload(
  actor: ActorContext,
  evidenceId: string
) {
  const file = await getOwnedEvidence(actor, evidenceId);
  requirePermission(actor, "evidence:download", { ownerUserId: file.userId });
  if (
    file.storageState !== "READY" ||
    file.purgedAt ||
    (file.expiresAt && file.expiresAt <= new Date())
  ) {
    throw new NotFoundError("This file is expired or no longer available.");
  }
  const owner = await prisma.user.findFirst({
    where: {
      id: file.userId,
      status: "ACTIVE",
      deletedAt: null,
      deletionRequestedAt: null,
    },
    select: { id: true },
  });
  if (!owner) throw new NotFoundError("This file is no longer available.");
  return file;
}

export async function scheduleOwnedEvidencePurge(actor: ActorContext, id: string) {
  const ref = await prisma.evidenceFile.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!ref) throw new NotFoundError("This file does not exist.");
  requirePermission(actor, "evidence:delete", { ownerUserId: ref.userId });
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, ref.userId);
    const file = await tx.evidenceFile.findUniqueOrThrow({ where: { id } });
    if (file.kind !== "ACCOUNT_EXPORT")
      await invalidateAccountExportsInTx(tx, file.userId);
    return tx.evidenceFile.update({
      where: { id },
      data: {
        storageState: "PURGE_PENDING",
        deletedAt: new Date(),
        purgeRequestedAt: new Date(),
      },
    });
  });
}

export async function hasPendingVerification(actor: ActorContext, requestId: string) {
  const request = await prisma.removalRequest.findFirst({
    where: { id: requestId, deletedAt: null },
    select: { userId: true },
  });
  if (!request) throw new NotFoundError("This request does not exist.");
  requirePermission(actor, "evidence:upload", { ownerUserId: request.userId });
  return Boolean(
    await prisma.removalRequest.findFirst({
      where: {
        id: requestId,
        status: "BROKER_REQUESTED_VERIFICATION",
        responses: {
          some: {
            classification: "VERIFICATION_REQUESTED",
            confirmedAt: { not: null },
            deletedAt: null,
          },
        },
      },
      select: { id: true },
    })
  );
}

export interface PrivateFileIntent {
  id: string;
  userId: string;
  profileId: string | null;
  removalRequestId: string | null;
  kind: EvidenceKind;
  storageKey: string;
  storageBackend: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  encryptionKeyId: string;
  filenameEnc: string;
  filenameMasked: string;
  expiresAt: Date | null;
  identityConsentRecordId: string | null;
}

export async function createPrivateFileIntent(
  actor: ActorContext,
  input: PrivateFileIntent
) {
  requirePermission(actor, "evidence:upload", { ownerUserId: input.userId });
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
    const owner = await tx.user.findFirst({
      where: {
        id: input.userId,
        status: "ACTIVE",
        deletionRequestedAt: null,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!owner)
      throw new AppError({ code: "FORBIDDEN", message: "This account is not active." });
    if (
      input.profileId &&
      !(await tx.userProfile.findFirst({
        where: { id: input.profileId, ownerUserId: input.userId, deletedAt: null },
        select: { id: true },
      }))
    ) {
      throw new NotFoundError("This profile does not exist.");
    }
    if (
      input.removalRequestId &&
      !(await tx.removalRequest.findFirst({
        where: {
          id: input.removalRequestId,
          userId: input.userId,
          ...(input.profileId ? { profileId: input.profileId } : {}),
          deletedAt: null,
        },
        select: { id: true },
      }))
    ) {
      throw new NotFoundError("This request does not exist.");
    }
    if (input.kind === "IDENTITY_DOCUMENT") {
      const verification =
        input.removalRequestId &&
        (await tx.removalRequest.findFirst({
          where: {
            id: input.removalRequestId,
            userId: input.userId,
            deletedAt: null,
            status: "BROKER_REQUESTED_VERIFICATION",
            responses: {
              some: {
                classification: "VERIFICATION_REQUESTED",
                confirmedAt: { not: null },
                deletedAt: null,
              },
            },
          },
          select: { profileId: true },
        }));
      const consent =
        input.identityConsentRecordId &&
        (await tx.consentRecord.findFirst({
          where: {
            id: input.identityConsentRecordId,
            actorUserId: input.userId,
            removalRequestId: input.removalRequestId,
            purpose: "IDENTITY_VERIFICATION",
            revokedAt: null,
          },
          select: { id: true },
        }));
      if (!verification || !consent)
        throw new AppError({
          code: "CONSENT_INVALID",
          message:
            "A current broker verification request and your explicit storage consent are required.",
        });
    }
    return tx.evidenceFile.create({
      data: {
        ...input,
        encryption: "APPLICATION_AES_GCM",
        storageState: "UPLOADING",
        isTemporary: input.expiresAt !== null,
        createdById: actor.isSystem ? null : actor.userId,
      },
    });
  });
}

export async function markPrivateFileReady(id: string) {
  const updated = await prisma.evidenceFile.updateMany({
    where: {
      id,
      storageState: "UPLOADING",
      deletedAt: null,
      user: { status: "ACTIVE", deletionRequestedAt: null },
    },
    data: { storageState: "READY" },
  });
  if (updated.count !== 1)
    throw new AppError({
      code: "CONFLICT",
      message: "This upload was cancelled while being stored.",
    });
  return prisma.evidenceFile.findUniqueOrThrow({ where: { id } });
}

export async function markPrivateFilePurgePending(id: string) {
  return prisma.evidenceFile.updateMany({
    where: { id, storageState: { not: "PURGED" } },
    data: {
      storageState: "PURGE_PENDING",
      purgeRequestedAt: new Date(),
      deletedAt: new Date(),
    },
  });
}

export async function listUnfinishedFilePurges(take = 100) {
  return prisma.evidenceFile.findMany({
    where: {
      OR: [
        { storageState: "PURGE_PENDING" },
        {
          storageState: "UPLOADING",
          updatedAt: { lt: new Date(Date.now() - 60 * 60 * 1000) },
        },
      ],
    },
    take,
    orderBy: { updatedAt: "asc" },
  });
}

export async function markEvidenceAccessed(id: string) {
  return prisma.evidenceFile.update({
    where: { id },
    data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
  });
}

function evidenceRetentionWhere(cutoff: Date): Prisma.EvidenceFileWhereInput {
  const closedPastCutoff = [
    { closedAt: { lte: cutoff } },
    { closedAt: null, updatedAt: { lte: cutoff } },
  ];
  return {
    deletedAt: null,
    isTemporary: false,
    OR: [
      { removalRequestId: null, createdAt: { lt: cutoff } },
      { removalRequest: { status: "CLOSED", OR: closedPastCutoff } },
      { removalRequest: { deletedAt: { not: null }, OR: closedPastCutoff } },
    ],
  };
}

export async function listRetentionDueEvidence(cutoff: Date, take = 50) {
  return prisma.evidenceFile.findMany({
    where: evidenceRetentionWhere(cutoff),
    take,
  });
}

export async function countRetentionDueEvidence(cutoff: Date): Promise<number> {
  return prisma.evidenceFile.count({ where: evidenceRetentionWhere(cutoff) });
}

function temporaryEvidenceWhere(): Prisma.EvidenceFileWhereInput {
  return {
    isTemporary: true,
    deletedAt: null,
    expiresAt: { lte: new Date() },
  };
}

export async function listExpiredTemporaryEvidence(take = 50) {
  return prisma.evidenceFile.findMany({
    where: temporaryEvidenceWhere(),
    take,
  });
}

export async function countExpiredTemporaryEvidence(): Promise<number> {
  return prisma.evidenceFile.count({ where: temporaryEvidenceWhere() });
}

export async function markEvidencePurged(id: string) {
  return prisma.evidenceFile.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      purgedAt: new Date(),
      storageState: "PURGED",
      filenameEnc: null,
      filenameMasked: null,
      metadata: {},
    },
  });
}

export type { EvidenceKind };
