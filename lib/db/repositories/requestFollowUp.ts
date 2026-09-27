import { z } from "zod";
import { AppError } from "@/lib/core/errors";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { parseJobPayload } from "@/lib/jobs/payloads";
import type { JobLease } from "@/lib/jobs/types";
import type { ActorContext } from "@/lib/permissions/actor";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { lockJobLeaseInTx } from "./jobLease";
import { createNotificationInTx } from "./notifications";
import { assertCurrentProfileConsent, loadRequestForDecision } from "./requestDecision";
import { applyRequestStatusInTx, insertSnapshot, type SnapshotInput } from "./requests";

type Decision = Awaited<ReturnType<typeof loadRequestForDecision>>;
const scheduleSchema = z.object({
  requestId: entityIdSchema,
  maxFollowUps: z.number().int().min(0).max(5),
});

/** Caller holds the account/profile/request locks and has checked current consent. */
export async function queueFollowUpInTx(
  tx: PrismaTransaction,
  actor: ActorContext,
  request: Decision,
  maxFollowUps: number,
  runAt: Date
) {
  const followUpNumber = request.followUpCount + 1;
  if (followUpNumber > maxFollowUps)
    throw new AppError({
      code: "QUOTA_EXCEEDED",
      message:
        "This request has reached the instance’s follow-up limit. Review the escalation guidance or close the request.",
    });
  if (!request.sentAt)
    throw new AppError({
      code: "CONFLICT",
      message: "Record the original submission before preparing a follow-up.",
    });
  if (
    await tx.outboundEmail.count({
      where: {
        removalRequestId: request.id,
        dispatchState: { in: ["DISPATCHING", "AMBIGUOUS", "RECONCILIATION_REQUIRED"] },
      },
    })
  )
    throw new AppError({
      code: "CONFLICT",
      message: "Resolve the previous delivery outcome before preparing another message.",
    });
  if (request.status !== "FOLLOW_UP_SCHEDULED")
    await applyRequestStatusInTx(tx, {
      requestId: request.id,
      from: request.status,
      to: "FOLLOW_UP_SCHEDULED",
      actor: actor.isSystem ? "SYSTEM" : "USER",
      actorUserId: actor.isSystem ? null : actor.userId,
      message:
        "A follow-up draft was requested. It will need fresh approval before submission.",
    });
  const idempotencyKey = `follow-up:${request.id}:${followUpNumber}`;
  const previous = await tx.backgroundJob.findUnique({ where: { idempotencyKey } });
  const payloadJson = parseJobPayload("PREPARE_FOLLOW_UP", {
    removalRequestId: request.id,
    followUpNumber,
  });
  if (!previous)
    await tx.backgroundJob.create({
      data: {
        type: "PREPARE_FOLLOW_UP",
        payloadJson,
        idempotencyKey,
        runAt,
        relatedRequestId: request.id,
        relatedUserId: request.userId,
      },
    });
  else if (["FAILED", "CANCELLED", "COMPLETED"].includes(previous.status))
    await tx.backgroundJob.update({
      where: { id: previous.id },
      data: {
        status: "PENDING",
        payloadJson,
        runAt,
        attemptCount: 0,
        completedAt: null,
        cancelledAt: null,
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
        leaseToken: null,
        lastError: null,
      },
    });
  else if (previous.status !== "RUNNING" && runAt < previous.runAt)
    await tx.backgroundJob.update({ where: { id: previous.id }, data: { runAt } });
  await tx.removalRequest.update({
    where: { id: request.id },
    data: {
      nextFollowUpAt:
        previous &&
        ["PENDING", "RETRYABLE", "RUNNING"].includes(previous.status) &&
        previous.runAt < runAt
          ? previous.runAt
          : runAt,
    },
  });
  return { requestId: request.id };
}

export async function scheduleRequestFollowUp(
  actor: ActorContext,
  requestId: string,
  maxFollowUps: number
) {
  const input = parseWithSchema(scheduleSchema, { requestId, maxFollowUps });
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(
      tx,
      actor,
      input.requestId,
      "request:update"
    );
    assertCurrentProfileConsent(request.profile);
    return queueFollowUpInTx(tx, actor, request, input.maxFollowUps, new Date());
  });
}

/** Cap changes and stale jobs must pass the same fence as draft publication. */
export async function canPrepareFollowUp(
  actor: ActorContext,
  requestId: string,
  followUpNumber: number,
  job: JobLease,
  maxFollowUps: number
) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(tx, actor, requestId, "request:update");
    if (
      !(await lockJobLeaseInTx(tx, job, "PREPARE_FOLLOW_UP", {
        removalRequestId: requestId,
        followUpNumber,
      }))
    )
      return false;
    if (
      request.status !== "FOLLOW_UP_SCHEDULED" ||
      request.followUpCount + 1 !== followUpNumber
    )
      return false;
    assertCurrentProfileConsent(request.profile);
    if (followUpNumber <= maxFollowUps) return true;
    await recommendEscalationInTx(tx, request);
    return false;
  });
}

export async function recommendEscalationInTx(tx: PrismaTransaction, request: Decision) {
  await applyRequestStatusInTx(tx, {
    requestId: request.id,
    from: request.status,
    to: "ESCALATION_RECOMMENDED",
    actor: "SYSTEM",
    actorUserId: null,
    message:
      "The instance’s follow-up limit has been reached. Review your recorded correspondence and the authority guidance. No complaint is filed automatically.",
  });
  await tx.removalRequest.update({
    where: { id: request.id },
    data: { nextFollowUpAt: null },
  });
  await createNotificationInTx(tx, {
    userId: request.userId,
    profileId: request.profileId,
    removalRequestId: request.id,
    type: "RECHECK_RECOMMENDED",
    severity: "ACTION_REQUIRED",
    title: "Review the next step",
    body: "The follow-up limit has been reached. Review the request history and escalation guidance, or close the request.",
    actionUrl: `/requests/${request.id}`,
    dedupeKey: `follow-up-limit:${request.id}:${request.followUpCount}`,
  });
}

export async function commitFollowUpDraft(
  actor: ActorContext,
  input: {
    requestId: string;
    followUpNumber: number;
    previousSnapshotId: string | null;
    job: JobLease;
    maxFollowUps: number;
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
    if (
      !(await lockJobLeaseInTx(tx, input.job, "PREPARE_FOLLOW_UP", {
        removalRequestId: request.id,
        followUpNumber: input.followUpNumber,
      }))
    )
      return { created: false };
    if (
      request.followUpCount >= input.followUpNumber ||
      request.status !== "FOLLOW_UP_SCHEDULED"
    )
      return { created: false };
    assertCurrentProfileConsent(request.profile);
    if (input.followUpNumber > input.maxFollowUps) {
      await recommendEscalationInTx(tx, request);
      return { created: false };
    }
    if (
      request.currentSnapshotId !== input.previousSnapshotId ||
      request.followUpCount + 1 !== input.followUpNumber
    )
      throw new AppError({
        code: "CONFLICT",
        message: "The request changed while its follow-up was being prepared.",
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
    await createNotificationInTx(tx, {
      userId: request.userId,
      profileId: request.profileId,
      removalRequestId: request.id,
      type: "APPROVAL_NEEDED",
      severity: "ACTION_REQUIRED",
      title: "Follow-up ready to review",
      body: "A follow-up draft is waiting for your review and approval.",
      actionUrl: `/requests/${request.id}/review`,
      dedupeKey: `follow-up-approval:${request.id}:${input.followUpNumber}`,
    });
    return { created: true };
  });
}
