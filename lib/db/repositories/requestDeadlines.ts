/** Deadline side effects commit with the request state, under the current worker lease. */
import { prisma } from "@/lib/db/client";
import { isAppError } from "@/lib/core/errors";
import type { JobLease } from "@/lib/jobs/types";
import type { ActorContext } from "@/lib/permissions/actor";
import { isRecheckReminderApplicable } from "@/lib/requests/reminders";
import { WAITING_STATUSES } from "@/lib/requests/stateMachine";
import { lockJobLeaseInTx } from "./jobLease";
import { assertCurrentProfileConsent, loadRequestForDecision } from "./requestDecision";
import { createNotificationInTx } from "./notifications";
import { applyRequestStatusInTx } from "./requests";
import { queueFollowUpInTx, recommendEscalationInTx } from "./requestFollowUp";

export async function scheduleOverdueRequest(
  actor: ActorContext,
  input: {
    requestId: string;
    now: Date;
    firstReminderDays: number;
    maxFollowUps: number;
    job: JobLease;
  }
) {
  return prisma.$transaction(
    async (tx) => {
      const request = await loadRequestForDecision(
        tx,
        actor,
        input.requestId,
        "request:update"
      );
      if (!(await lockJobLeaseInTx(tx, input.job, "DEADLINE_WATCH", {})))
        return { marked: false, queued: false };
      if (
        (!WAITING_STATUSES.includes(request.status) &&
          request.status !== "NO_RESPONSE") ||
        !request.deadlineAt ||
        request.deadlineAt > input.now
      )
        return { marked: false, queued: false };
      const prior = await tx.notification.findFirst({
        where: {
          userId: request.userId,
          dedupeKey: `deadline-handled:${request.id}:${request.followUpCount}`,
        },
        select: { id: true },
      });
      if (request.status === "NO_RESPONSE" && prior)
        return { marked: false, queued: false };
      if (request.status !== "NO_RESPONSE")
        await applyRequestStatusInTx(tx, {
          requestId: request.id,
          from: request.status,
          to: "NO_RESPONSE",
          actor: "SYSTEM",
          actorUserId: null,
          message:
            "The recorded response date passed without a confirmed broker outcome. This date is not a guarantee of a response.",
        });
      const overdue = { ...request, status: "NO_RESPONSE" as const };
      let hasConsent = true;
      try {
        assertCurrentProfileConsent(request.profile);
      } catch (error) {
        if (
          !isAppError(error) ||
          !["CONSENT_INVALID", "CONSENT_REQUIRED"].includes(error.code)
        )
          throw error;
        hasConsent = false;
      }
      const unresolved = await tx.outboundEmail.count({
        where: {
          removalRequestId: request.id,
          dispatchState: { in: ["DISPATCHING", "AMBIGUOUS", "RECONCILIATION_REQUIRED"] },
        },
      });
      const eligible = hasConsent && !unresolved && !!request.sentAt;
      let queued = false;
      if (eligible && request.followUpCount < input.maxFollowUps) {
        const latestManual =
          request.followUpCount > 0
            ? await tx.manualSubmission.aggregate({
                where: { removalRequestId: request.id },
                _max: { submittedOn: true },
              })
            : null;
        const anchor = new Date(
          Math.max(
            request.deadlineAt.getTime(),
            ...(request.followUpCount > 0
              ? [
                  request.sentAt?.getTime() ?? 0,
                  latestManual?._max.submittedOn?.getTime() ?? 0,
                ]
              : [])
          )
        );
        const runAt = new Date(anchor.getTime() + input.firstReminderDays * 86400_000);
        await queueFollowUpInTx(tx, actor, overdue, input.maxFollowUps, runAt);
        queued = true;
        await tx.backgroundJob.upsert({
          where: { idempotencyKey: `recheck:${request.id}:${request.followUpCount}` },
          update: {},
          create: {
            type: "RECHECK_REMINDER",
            payloadJson: { removalRequestId: request.id },
            idempotencyKey: `recheck:${request.id}:${request.followUpCount}`,
            runAt,
            relatedUserId: request.userId,
            relatedRequestId: request.id,
          },
        });
      } else if (eligible) await recommendEscalationInTx(tx, overdue);
      await createNotificationInTx(tx, {
        userId: request.userId,
        profileId: request.profileId,
        removalRequestId: request.id,
        type: "RECHECK_RECOMMENDED",
        severity: queued ? "INFO" : "ACTION_REQUIRED",
        title: queued ? "Follow-up scheduled" : "Review this overdue request",
        body: queued
          ? "A follow-up draft has been scheduled. It will require your review and approval before submission."
          : "Review your consent, correspondence and previous delivery outcome before taking the next step.",
        actionUrl: `/requests/${request.id}`,
        dedupeKey: `deadline-handled:${request.id}:${request.followUpCount}`,
      });
      return { marked: true, queued };
    },
    { timeout: 15_000 }
  );
}

export async function recordDeadlineWarning(
  actor: ActorContext,
  input: { requestId: string; now: Date; warningBefore: Date; job: JobLease }
) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(
      tx,
      actor,
      input.requestId,
      "request:update"
    );
    if (!(await lockJobLeaseInTx(tx, input.job, "DEADLINE_WATCH", {}))) return false;
    if (
      !WAITING_STATUSES.includes(request.status) ||
      !request.deadlineAt ||
      request.deadlineAt <= input.now ||
      request.deadlineAt > input.warningBefore
    )
      return false;
    await createNotificationInTx(tx, {
      userId: request.userId,
      profileId: request.profileId,
      removalRequestId: request.id,
      type: "DEADLINE_APPROACHING",
      severity: "WARNING",
      title: "Response date approaching",
      body: "A broker request is approaching the response date recorded for it. This is a reminder, not a guarantee that the broker will answer.",
      actionUrl: `/requests/${request.id}`,
      dedupeKey: `deadline-warning:${request.id}`,
    });
    return true;
  });
}

export async function recordRecheckReminder(
  actor: ActorContext,
  requestId: string,
  job: JobLease
) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(tx, actor, requestId, "request:update");
    if (
      !(await lockJobLeaseInTx(tx, job, "RECHECK_REMINDER", {
        removalRequestId: requestId,
      }))
    )
      return false;
    if (!isRecheckReminderApplicable(request.status)) return false;
    await createNotificationInTx(tx, {
      userId: request.userId,
      profileId: request.profileId,
      removalRequestId: request.id,
      type: "RECHECK_RECOMMENDED",
      severity: "ACTION_REQUIRED",
      title: "Review your request’s progress",
      body: "Review the recorded correspondence. If the broker publishes a listing, you can check it yourself. Brokermogger does not scrape or log in on your behalf.",
      actionUrl: `/requests/${request.id}`,
      dedupeKey: `recheck-reminder:${job.id}`,
    });
    return true;
  });
}
