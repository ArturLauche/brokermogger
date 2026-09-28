import { z } from "zod";
import { AppError } from "@/lib/core/errors";
import { selectRequestDelivery } from "@/lib/brokers/sendable";
import { followUpKindSchema, type FollowUpKind } from "@/lib/requests/followUpKind";
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
  kind: followUpKindSchema.optional(),
});

/** The caller has already checked the request owner; only a yes/no proof is returned. */
export async function hasSubmittedFollowUpInTx(tx: PrismaTransaction, requestId: string) {
  const rows = await tx.$queryRaw<{ submitted: boolean }[]>`
    SELECT (
      EXISTS (SELECT 1 FROM "OutboundEmail" WHERE "removalRequestId" = ${requestId}
        AND purpose = 'BROKER_FOLLOW_UP' AND "dispatchState" = 'ACCEPTED' AND status <> 'BOUNCED')
      OR EXISTS (SELECT 1 FROM "ManualSubmission" m JOIN "RequestSnapshot" s ON s.id = m."snapshotId"
        WHERE m."removalRequestId" = ${requestId} AND (s.variables->>'followUpNumber') ~ '^[1-9][0-9]?$')
    ) AS submitted
  `;
  return rows[0]?.submitted ?? false;
}

async function assertReminderPrerequisites(
  tx: PrismaTransaction,
  request: Decision,
  kind: FollowUpKind
) {
  if (request.templateVersion?.template.requestType === "FINAL_REMINDER")
    throw new AppError({
      code: "CONFLICT",
      message:
        "A final reminder has already been prepared. Review escalation guidance or close this request.",
    });
  if (kind === "FINAL_REMINDER" && !(await hasSubmittedFollowUpInTx(tx, request.id)))
    throw new AppError({
      code: "CONFLICT",
      message:
        "Submit a follow-up and record its outcome before preparing a final reminder.",
    });
}

async function lockReminderLease(
  tx: PrismaTransaction,
  job: JobLease,
  requestId: string,
  followUpNumber: number,
  kind: FollowUpKind
) {
  if (
    !(await lockJobLeaseInTx(tx, job, "PREPARE_FOLLOW_UP", {
      removalRequestId: requestId,
      followUpNumber,
    }))
  )
    return false;
  const stored = await tx.backgroundJob.findUniqueOrThrow({
    where: { id: job.id },
    select: { payloadJson: true },
  });
  return (
    (parseJobPayload("PREPARE_FOLLOW_UP", stored.payloadJson).kind ?? "FOLLOW_UP") ===
    kind
  );
}

/** Caller holds the account/profile/request locks and has checked current consent. */
export async function queueFollowUpInTx(
  tx: PrismaTransaction,
  actor: ActorContext,
  request: Decision,
  maxFollowUps: number,
  runAt: Date,
  requestedKind?: FollowUpKind
) {
  const followUpNumber = request.followUpCount + 1;
  const idempotencyKey = `follow-up:${request.id}:${followUpNumber}`;
  const previous = await tx.backgroundJob.findUnique({ where: { idempotencyKey } });
  const previousKind = previous
    ? (parseJobPayload("PREPARE_FOLLOW_UP", previous.payloadJson).kind ?? "FOLLOW_UP")
    : null;
  const kind = requestedKind ?? previousKind ?? "FOLLOW_UP";
  if (previousKind && previousKind !== kind)
    throw new AppError({
      code: "CONFLICT",
      message:
        "A different reminder is already scheduled. Retry that preparation from the request history.",
    });
  await assertReminderPrerequisites(tx, request, kind);
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
        kind === "FINAL_REMINDER"
          ? "A final reminder was requested. It will need fresh approval before submission."
          : "A follow-up draft was requested. It will need fresh approval before submission.",
    });
  const payloadJson = parseJobPayload("PREPARE_FOLLOW_UP", {
    removalRequestId: request.id,
    followUpNumber,
    kind,
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
  maxFollowUps: number,
  kind?: FollowUpKind
) {
  const input = parseWithSchema(scheduleSchema, { requestId, maxFollowUps, kind });
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(
      tx,
      actor,
      input.requestId,
      "request:update"
    );
    assertCurrentProfileConsent(request.profile);
    return queueFollowUpInTx(
      tx,
      actor,
      request,
      input.maxFollowUps,
      new Date(),
      input.kind
    );
  });
}

/** Cap changes and stale jobs must pass the same fence as draft publication. */
export async function canPrepareFollowUp(
  actor: ActorContext,
  requestId: string,
  followUpNumber: number,
  job: JobLease,
  maxFollowUps: number,
  kind: FollowUpKind = "FOLLOW_UP"
) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(tx, actor, requestId, "request:update");
    if (!(await lockReminderLease(tx, job, requestId, followUpNumber, kind)))
      return false;
    if (
      request.status !== "FOLLOW_UP_SCHEDULED" ||
      request.followUpCount + 1 !== followUpNumber
    )
      return false;
    assertCurrentProfileConsent(request.profile);
    await assertReminderPrerequisites(tx, request, kind);
    if (followUpNumber <= maxFollowUps) return true;
    await recommendEscalationInTx(tx, request);
    return false;
  });
}

export async function recommendEscalationInTx(
  tx: PrismaTransaction,
  request: Decision,
  reason: "limit" | "final_reminder" = "limit"
) {
  await applyRequestStatusInTx(tx, {
    requestId: request.id,
    from: request.status,
    to: "ESCALATION_RECOMMENDED",
    actor: "SYSTEM",
    actorUserId: null,
    message:
      reason === "final_reminder"
        ? "The response date has passed after the final reminder. Review the correspondence and authority guidance. No further reminder or complaint is sent automatically."
        : "The instance’s follow-up limit has been reached. Review your recorded correspondence and the authority guidance. No complaint is filed automatically.",
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
    body: "Review the request history and escalation guidance, or close the request. Nothing is filed automatically.",
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
    kind?: FollowUpKind;
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
      !(await lockReminderLease(
        tx,
        input.job,
        request.id,
        input.followUpNumber,
        input.kind ?? "FOLLOW_UP"
      ))
    )
      return { created: false };
    if (
      request.followUpCount >= input.followUpNumber ||
      request.status !== "FOLLOW_UP_SCHEDULED"
    )
      return { created: false };
    assertCurrentProfileConsent(request.profile);
    await assertReminderPrerequisites(tx, request, input.kind ?? "FOLLOW_UP");
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
    const template = input.snapshot.templateVersionId
      ? await tx.requestTemplateVersion.findFirst({
          where: {
            id: input.snapshot.templateVersionId,
            status: "PUBLISHED",
            template: {
              isActive: true,
              deletedAt: null,
              requestType: input.kind ?? "FOLLOW_UP",
            },
          },
          select: { id: true },
        })
      : null;
    if (!template)
      throw new AppError({
        code: "CONFLICT",
        message:
          "The reminder template changed. Retry preparation using a current published template.",
      });
    await tx.removalRequest.update({
      where: { id: request.id },
      data: selectRequestDelivery(request.broker),
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
      title:
        input.kind === "FINAL_REMINDER"
          ? "Final reminder ready to review"
          : "Follow-up ready to review",
      body:
        input.kind === "FINAL_REMINDER"
          ? "The final reminder is waiting for your review and approval."
          : "A follow-up draft is waiting for your review and approval.",
      actionUrl: `/requests/${request.id}/review`,
      dedupeKey: `follow-up-approval:${request.id}:${input.followUpNumber}`,
    });
    return { created: true };
  });
}
