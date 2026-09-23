import { AppError } from "@/lib/core/errors";
import type { PrismaTransaction } from "@/lib/db/client";

/** Call only after checking the resource owner through the central permission policy. */
export async function lockActiveAccount(tx: PrismaTransaction, userId: string) {
  await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const active = await tx.user.findFirst({
    where: { id: userId, status: "ACTIVE", deletionRequestedAt: null, deletedAt: null },
    select: { id: true },
  });
  if (!active)
    throw new AppError({ code: "FORBIDDEN", message: "This account is not active." });
}
