import { prisma } from "@/lib/db/client";
import { NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { isCrossAccountAccess, requirePermission } from "@/lib/permissions/policy";
import { hasSubmittedFollowUpInTx } from "./requestFollowUp";
import { parseJobPayload } from "@/lib/jobs/payloads";

/** Queue status for an owner's recovery controls; payloads and errors remain private. */
export async function getRequestWork(actor: ActorContext, requestId: string) {
  const request = await prisma.removalRequest.findFirst({
    where: { id: requestId, deletedAt: null },
    select: { userId: true, followUpCount: true, currentSnapshotId: true },
  });
  if (!request) throw new NotFoundError();
  requirePermission(actor, "request:read", { ownerUserId: request.userId });
  if (isCrossAccountAccess(actor, { ownerUserId: request.userId }))
    return { followUp: null, send: null, hasSubmittedFollowUp: false };
  const select = {
    id: true,
    status: true,
    runAt: true,
    attemptCount: true,
    maxAttempts: true,
    lockExpiresAt: true,
  } as const;
  const [followUp, send, hasSubmittedFollowUp] = await Promise.all([
    prisma.backgroundJob.findUnique({
      where: { idempotencyKey: `follow-up:${requestId}:${request.followUpCount + 1}` },
      select: { ...select, payloadJson: true },
    }),
    prisma.backgroundJob.findFirst({
      where: {
        relatedRequestId: requestId,
        relatedUserId: request.userId,
        type: "SEND_REQUEST",
        payloadJson: { path: ["snapshotId"], equals: request.currentSnapshotId ?? "" },
      },
      orderBy: { createdAt: "desc" },
      select,
    }),
    hasSubmittedFollowUpInTx(prisma, requestId),
  ]);
  const safeFollowUp = followUp
    ? (() => {
        const { payloadJson, ...status } = followUp;
        return {
          ...status,
          kind: parseJobPayload("PREPARE_FOLLOW_UP", payloadJson).kind ?? "FOLLOW_UP",
        };
      })()
    : null;
  return { followUp: safeFollowUp, send, hasSubmittedFollowUp };
}
