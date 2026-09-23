import { AppError } from "@/lib/core/errors";
import { prisma } from "@/lib/db/client";
import { parseJobPayload } from "@/lib/jobs/payloads";
import type { ActorContext } from "@/lib/permissions/actor";
import { identifierDigest } from "@/lib/requests/envelope";

import { assertCurrentProfileConsent, loadRequestForDecision } from "./requestDecision";
import { applyRequestStatusInTx, insertSnapshot, type SnapshotInput } from "./requests";

export async function scheduleRequestFollowUp(
  actor: ActorContext,
  requestId: string,
  maxFollowUps: number
) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(tx, actor, requestId, "request:update");
    assertCurrentProfileConsent(request.profile);
    const followUpNumber = request.followUpCount + 1;
    if (followUpNumber > maxFollowUps)
      throw new AppError({
        code: "QUOTA_EXCEEDED",
        message:
          "This request has reached the instance’s follow-up limit. Review the escalation guidance or close the request.",
      });
    if (request.status !== "FOLLOW_UP_SCHEDULED")
      await applyRequestStatusInTx(tx, {
        requestId,
        from: request.status,
        to: "FOLLOW_UP_SCHEDULED",
        actor: actor.isSystem ? "SYSTEM" : "USER",
        actorUserId: actor.isSystem ? null : actor.userId,
        message:
          "A follow-up draft was requested. It will need fresh approval before submission.",
      });
    const idempotencyKey = `follow-up:${request.id}:${followUpNumber}`;
    await tx.backgroundJob.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        type: "PREPARE_FOLLOW_UP",
        payloadJson: parseJobPayload("PREPARE_FOLLOW_UP", {
          removalRequestId: request.id,
          followUpNumber,
        }),
        idempotencyKey,
        relatedRequestId: request.id,
        relatedUserId: request.userId,
      },
    });
    return { requestId: request.id };
  });
}

export async function commitFollowUpDraft(
  actor: ActorContext,
  input: {
    requestId: string;
    followUpNumber: number;
    previousSnapshotId: string | null;
    snapshot: Omit<SnapshotInput, "version" | "removalRequestId" | "createdByUserId">;
  }
) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(
      tx,
      actor,
      input.requestId,
      "request:update"
    );
    assertCurrentProfileConsent(request.profile);
    if (request.followUpCount >= input.followUpNumber) return { created: false };
    if (
      request.status !== "FOLLOW_UP_SCHEDULED" ||
      request.currentSnapshotId !== input.previousSnapshotId ||
      request.followUpCount + 1 !== input.followUpNumber
    )
      throw new AppError({
        code: "CONFLICT",
        message: "The request changed while its follow-up was being prepared.",
      });
    const identifiers = await tx.profileIdentifier.findMany({
      where: {
        profileId: request.profileId,
        id: { in: request.includedIdentifierIds },
        deletedAt: null,
      },
      select: { id: true, valueBi: true },
    });
    if (
      identifiers.length !== request.includedIdentifierIds.length ||
      identifierDigest(identifiers) !== input.snapshot.identifierDigest
    )
      throw new AppError({
        code: "CONFLICT",
        message: "The selected identifiers changed. Prepare a fresh draft.",
      });
    const previous = await tx.requestSnapshot.aggregate({
      where: { removalRequestId: request.id },
      _max: { version: true },
    });
    const snapshot = await insertSnapshot(
      {
        ...input.snapshot,
        removalRequestId: request.id,
        version: (previous._max.version ?? 0) + 1,
        createdByUserId: actor.isSystem ? null : actor.userId,
      },
      tx
    );
    await tx.removalRequest.update({
      where: { id: request.id },
      data: {
        currentSnapshotId: snapshot.id,
        followUpCount: input.followUpNumber,
        nextFollowUpAt: null,
        templateVersionId: input.snapshot.templateVersionId,
      },
    });
    await applyRequestStatusInTx(tx, {
      requestId: request.id,
      from: "FOLLOW_UP_SCHEDULED",
      to: "AWAITING_USER_APPROVAL",
      actor: actor.isSystem ? "SYSTEM" : "USER",
      actorUserId: actor.isSystem ? null : actor.userId,
      message:
        "The follow-up draft is ready for review. Nothing will be sent without fresh approval.",
    });
    const dedupeKey = `follow-up-approval:${request.id}:${input.followUpNumber}`;
    await tx.notification.upsert({
      where: { userId_dedupeKey: { userId: request.userId, dedupeKey } },
      update: {},
      create: {
        userId: request.userId,
        profileId: request.profileId,
        removalRequestId: request.id,
        type: "APPROVAL_NEEDED",
        channel: "IN_APP",
        severity: "ACTION_REQUIRED",
        title: "Follow-up ready to review",
        body: "A follow-up draft is waiting for your review and approval.",
        actionUrl: `/requests/${request.id}/review`,
        dedupeKey,
      },
    });
    return { created: true };
  });
}
