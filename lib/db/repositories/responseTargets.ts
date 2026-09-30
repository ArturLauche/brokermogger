import type { PrismaTransaction } from "@/lib/db/client";
import { NotFoundError } from "@/lib/core/errors";
import { responseTarget } from "@/lib/jurisdiction/deadlines";

/** Calculate from the submitted snapshot's immutable legal version, never today's catalogue. */
export async function calculateResponseTargetInTx(
  tx: PrismaTransaction,
  input: Omit<Parameters<typeof responseTarget>[0], "policy"> & {
    requestId: string;
    snapshotId: string;
  }
) {
  const snapshot = await tx.requestSnapshot.findFirst({
    where: { id: input.snapshotId, removalRequestId: input.requestId, erasedAt: null },
    select: { legalRuleVersionId: true },
  });
  if (!snapshot) throw new NotFoundError("The submitted message is unavailable.");
  const rule = snapshot.legalRuleVersionId
    ? await tx.legalRuleVersion.findUnique({
        where: { id: snapshot.legalRuleVersionId },
        select: { deadlineRule: true },
      })
    : null;
  return {
    ...responseTarget({ ...input, policy: rule?.deadlineRule }),
    deadlineSnapshotId: input.snapshotId,
  };
}
