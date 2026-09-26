/**
 * Deadline watch and recheck reminders.
 *
 * The watch never files an escalation with an authority. It only:
 *  - notifies the account holder that a response date is near,
 *  - marks waiting requests as `NO_RESPONSE` after the date,
 *  - queues a follow-up draft that still requires approval,
 *  - reminds the user to re-check a broker listing themselves (no scraping).
 *
 * Side effects are enqueued before a status change that would hide the request
 * from the next pass, so a failed enqueue is retried. Recheck jobs that fire
 * after a terminal status are a no-op.
 */
import type { RequestStatus } from "@prisma/client";

import { recordAudit } from "@/lib/audit/service";
import { getSetting } from "@/lib/config/runtimeSettings";
import { isAppError } from "@/lib/core/errors";
import { createNotification } from "@/lib/db/repositories/notifications";
import {
  getOwnedRequest,
  listDeadlineWarningRequests,
  listOverdueWaitingRequests,
} from "@/lib/db/repositories/requests";
import { enqueueJob } from "@/lib/jobs/queue";
import { createLogger } from "@/lib/observability/logger";
import { systemActor } from "@/lib/permissions/actor";
import { markNoResponse } from "@/lib/requests/lifecycle";
import { WAITING_STATUSES } from "@/lib/requests/stateMachine";

import { daysFromNow } from "./datetime";
import type { JobResult } from "./types";

const log = createLogger("jobs.deadlines");
const BATCH = 50;
const MAX_BATCHES = 20;

const RECHECK_REMINDER_STATUSES = new Set<RequestStatus>([
  ...WAITING_STATUSES,
  "NO_RESPONSE",
  "FOLLOW_UP_SCHEDULED",
  "ESCALATION_RECOMMENDED",
  "PARTIALLY_COMPLETED",
]);

export function isRecheckReminderApplicable(status: RequestStatus): boolean {
  return RECHECK_REMINDER_STATUSES.has(status);
}

export async function runDeadlineWatch(windowDays: number): Promise<JobResult> {
  const now = new Date();
  const warningDays = await getSetting("followUpDeadlineWarningDays");
  const firstReminderDays = await getSetting("followUpFirstReminderDays");
  const actor = systemActor("deadline-watch");
  const warningBefore = daysFromNow(now, Math.min(windowDays, warningDays));

  let warned = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const warnings = await listDeadlineWarningRequests({
      now,
      warningBefore,
      take: BATCH,
    });
    if (warnings.length === 0) break;
    for (const request of warnings) {
      try {
        await createNotification(actor, {
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
        warned += 1;
      } catch (error) {
        log.warn(
          {
            requestId: request.id,
            code: isAppError(error) ? error.code : "INTERNAL_ERROR",
          },
          "Deadline warning skipped a request"
        );
      }
    }
    if (warnings.length < BATCH) break;
  }

  const seenOverdue = new Set<string>();
  let marked = 0;
  let followUpsQueued = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const overdue = await listOverdueWaitingRequests(now, BATCH);
    const fresh = overdue.filter((request) => !seenOverdue.has(request.id));
    if (fresh.length === 0) break;
    for (const request of fresh) {
      seenOverdue.add(request.id);
      try {
        const followUpNumber = request.followUpCount + 1;
        const created = await enqueueJob({
          type: "PREPARE_FOLLOW_UP",
          payload: { removalRequestId: request.id, followUpNumber },
          idempotencyKey: `follow-up:${request.id}:${followUpNumber}`,
          runAt: daysFromNow(now, firstReminderDays),
          relatedUserId: request.userId,
          relatedRequestId: request.id,
        });
        if (created.created) followUpsQueued += 1;

        await enqueueJob({
          type: "RECHECK_REMINDER",
          payload: { removalRequestId: request.id },
          idempotencyKey: `recheck:${request.id}`,
          runAt: daysFromNow(now, firstReminderDays),
          relatedUserId: request.userId,
          relatedRequestId: request.id,
        });

        await markNoResponse(actor, request.id);
        marked += 1;
      } catch (error) {
        log.warn(
          {
            requestId: request.id,
            code: isAppError(error) ? error.code : "INTERNAL_ERROR",
          },
          "Deadline watch skipped a request"
        );
      }
    }
  }

  log.info({ warned, marked, followUpsQueued }, "Deadline watch pass complete");
  return {
    message: "Deadline watch pass complete.",
    metadata: { warned, marked, followUpsQueued },
  };
}

export async function runRecheckReminder(removalRequestId: string): Promise<JobResult> {
  const actor = systemActor(`recheck:${removalRequestId}`);
  let request;
  try {
    request = await getOwnedRequest(actor, removalRequestId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") {
      return { message: "Request no longer exists." };
    }
    throw error;
  }

  if (!isRecheckReminderApplicable(request.status)) {
    return {
      message: `Recheck reminder skipped; the request is ${request.status}.`,
    };
  }

  await createNotification(actor, {
    userId: request.userId,
    profileId: request.profileId,
    removalRequestId: request.id,
    type: "RECHECK_RECOMMENDED",
    severity: "ACTION_REQUIRED",
    title: "Recheck this broker listing",
    body: "The response date for this request has passed. Open the broker's own published page and check whether the listing is still there. This product does not scrape or log in on your behalf.",
    actionUrl: `/requests/${request.id}`,
    dedupeKey: `recheck:${request.id}`,
  });

  await recordAudit({
    actor,
    action: "request.status_changed",
    resourceType: "removal_request",
    resourceId: request.id,
    metadata: { reminder: "recheck" },
  });

  return { message: "Recheck reminder recorded." };
}
