/**
 * Account-level reads and writes for the signed-in user.
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
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
