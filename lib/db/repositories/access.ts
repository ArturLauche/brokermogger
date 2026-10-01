import { AppError } from "@/lib/core/errors";
import type { PrismaTransaction } from "@/lib/db/client";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission, type Action } from "@/lib/permissions/policy";

/** Call only after checking the resource owner through the central permission policy. */
export async function lockActiveAccount(tx: PrismaTransaction, userId: string) {
  await lockAccount(tx, userId);
}

async function lockAccount(tx: PrismaTransaction, userId: string) {
  await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const active = await tx.user.findFirst({
    where: { id: userId, status: "ACTIVE", deletionRequestedAt: null, deletedAt: null },
    select: { id: true, role: true },
  });
  if (!active)
    throw new AppError({ code: "FORBIDDEN", message: "This account is not active." });
  return active;
}

/** Recheck current authority under the account lock before a privileged human write. */
export async function lockAuthorizedAccount(
  tx: PrismaTransaction,
  actor: ActorContext,
  action: Action
) {
  if (actor.isSystem)
    throw new AppError({
      code: "FORBIDDEN",
      message: "This catalogue operation requires an active operator account.",
    });
  const active = await lockAccount(tx, actor.userId);
  requirePermission({ ...actor, role: active.role }, action);
}
