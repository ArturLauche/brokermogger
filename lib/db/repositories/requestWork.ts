import { prisma } from "@/lib/db/client";
import { NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { isCrossAccountAccess, requirePermission } from "@/lib/permissions/policy";
import { hasSubmittedFollowUpInTx } from "./requestFollowUp";
import { readFollowUpWork } from "@/lib/requests/followUpWork";

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
    prisma.backgroundJob.findFirst({
      where: {
        idempotencyKey: `follow-up:${requestId}:${request.followUpCount + 1}`,
        type: "PREPARE_FOLLOW_UP",
        relatedUserId: request.userId,
        relatedRequestId: requestId,
      },
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
        const payload = readFollowUpWork(
          payloadJson,
          requestId,
          request.followUpCount + 1
        );
        return {
          ...status,
          kind: payload ? (payload.kind ?? "FOLLOW_UP") : null,
          invalidPayload: !payload,
        };
      })()
    : null;
  return { followUp: safeFollowUp, send, hasSubmittedFollowUp };
}
