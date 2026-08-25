/**
 * Account-level reads and writes for the signed-in user.
 */
import type { Prisma } from "@prisma/client";

import { prisma, withAppendOnlyDeletes } from "@/lib/db/client";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";

export async function getOwnedAccount(actor: ActorContext) {
  requirePermission(actor, "account:read", { ownerUserId: actor.userId });
  return prisma.user.findUniqueOrThrow({
    where: { id: actor.userId },
    include: {
      sessions: { orderBy: { expires: "desc" } },
      quota: true,
    },
  });
}

export async function updateOwnedAccount(
  actor: ActorContext,
  data: { name?: string; timezone?: string; preferences?: Prisma.InputJsonValue }
) {
  requirePermission(actor, "account:read", { ownerUserId: actor.userId });
  return prisma.user.update({
    where: { id: actor.userId },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      ...(data.preferences !== undefined ? { preferences: data.preferences } : {}),
    },
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
  return prisma.user.update({
    where: { id: actor.userId },
    data: { deletionRequestedAt: new Date() },
  });
}

/**
 * Worker-only: anonymise identifiers after the owner requested deletion.
 * Uses the append-only escape hatch so the database triggers allow the update.
 */
export async function anonymiseDeletedAccount(userId: string): Promise<void> {
  await withAppendOnlyDeletes(async (tx) => {
    await tx.profileIdentifier.updateMany({
      where: { profile: { ownerUserId: userId } },
      data: { deletedAt: new Date() },
    });
    await tx.userProfile.updateMany({
      where: { ownerUserId: userId },
      data: {
        deletedAt: new Date(),
        legalNameEnc: null,
        contactEmailEnc: null,
        displayName: "Deleted profile",
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        status: "DELETED",
        anonymizedAt: new Date(),
        name: null,
        email: `deleted-${userId}@anonymised.invalid`,
      },
    });
    await tx.backgroundJob.updateMany({
      where: { relatedUserId: userId, status: { in: ["PENDING", "RETRYABLE"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
  });
}
