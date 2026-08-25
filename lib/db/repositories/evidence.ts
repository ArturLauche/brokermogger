/**
 * Ownership-scoped evidence files.
 */
import type { EvidenceKind, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";

export async function listOwnedEvidence(actor: ActorContext, profileId: string | null) {
  requirePermission(actor, "evidence:read", { ownerUserId: actor.userId });
  return prisma.evidenceFile.findMany({
    where: {
      userId: actor.userId,
      deletedAt: null,
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
  return file;
}

export async function getOwnedEvidenceForDownload(
  actor: ActorContext,
  evidenceId: string
) {
  const file = await getOwnedEvidence(actor, evidenceId);
  requirePermission(actor, "evidence:download", { ownerUserId: file.userId });
  return file;
}

export async function createEvidenceFile(data: Prisma.EvidenceFileCreateInput) {
  return prisma.evidenceFile.create({ data });
}

export async function markEvidenceAccessed(id: string) {
  return prisma.evidenceFile.update({
    where: { id },
    data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
  });
}

export async function softDeleteEvidence(actor: ActorContext, evidenceId: string) {
  const file = await getOwnedEvidence(actor, evidenceId);
  requirePermission(actor, "evidence:delete", { ownerUserId: file.userId });
  return prisma.evidenceFile.update({
    where: { id: evidenceId },
    data: { deletedAt: new Date() },
  });
}

export async function listRetentionDueEvidence(cutoff: Date, take = 50) {
  const closedPastCutoff = [
    { closedAt: { lte: cutoff } },
    { closedAt: null, updatedAt: { lte: cutoff } },
  ];

  return prisma.evidenceFile.findMany({
    where: {
      deletedAt: null,
      isTemporary: false,
      OR: [
        { removalRequestId: null, createdAt: { lt: cutoff } },
        { removalRequest: { status: "CLOSED", OR: closedPastCutoff } },
        { removalRequest: { deletedAt: { not: null }, OR: closedPastCutoff } },
      ],
    },
    take,
  });
}

export async function listExpiredTemporaryEvidence(take = 50) {
  return prisma.evidenceFile.findMany({
    where: {
      isTemporary: true,
      deletedAt: null,
      expiresAt: { lte: new Date() },
    },
    take,
  });
}

export async function markEvidencePurged(id: string) {
  return prisma.evidenceFile.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

export type { EvidenceKind };
