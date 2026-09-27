/**
 * Deadline watch and recheck reminders.
 *
 * The watch never files an escalation with an authority. It only:
 *  - notifies the account holder that a response date is near,
 *  - marks waiting requests as `NO_RESPONSE` after the date,
 *  - queues a follow-up draft that still requires approval,
 *  - reminds the user to re-check a broker listing themselves (no scraping).
 *
 * State, queued preparation and notification commit together under a lease.
 * Reminders recheck the current state inside their publication transaction.
 */
import { recordAudit } from "@/lib/audit/service";
import { getSetting } from "@/lib/config/runtimeSettings";
import { isAppError } from "@/lib/core/errors";
import {
  scheduleOverdueRequest,
  recordDeadlineWarning,
  recordRecheckReminder,
} from "@/lib/db/repositories/requestDeadlines";
import {
  listDeadlineWarningRequests,
  listOverdueWaitingRequests,
} from "@/lib/db/repositories/requests";
import { createLogger } from "@/lib/observability/logger";
import { systemActor } from "@/lib/permissions/actor";

import { daysFromNow } from "./datetime";
import type { JobResult, JobLease } from "./types";

const log = createLogger("jobs.deadlines");
const BATCH = 50;
const MAX_BATCHES = 20;

export { isRecheckReminderApplicable } from "@/lib/requests/reminders";

export async function runDeadlineWatch(
  windowDays: number,
  job: JobLease
): Promise<JobResult> {
  const now = new Date();
  const warningDays = await getSetting("followUpDeadlineWarningDays");
  const firstReminderDays = await getSetting("followUpFirstReminderDays");
  const maxFollowUps = await getSetting("followUpMaxAttempts");
  const actor = systemActor(job.id);
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
        if (
          await recordDeadlineWarning(actor, {
            requestId: request.id,
            now,
            warningBefore,
            job,
          })
        )
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
        const result = await scheduleOverdueRequest(actor, {
          requestId: request.id,
          now,
          firstReminderDays,
          maxFollowUps,
          job,
        });
        if (result.marked) marked += 1;
        if (result.queued) followUpsQueued += 1;
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

export async function runRecheckReminder(
  removalRequestId: string,
  job: JobLease
): Promise<JobResult> {
  const actor = systemActor(job.id);
  const created = await recordRecheckReminder(actor, removalRequestId, job);
  if (!created)
    return {
      message: "This reminder is no longer applicable or its worker lease expired.",
    };
  await recordAudit({
    actor,
    action: "request.status_changed",
    resourceType: "removal_request",
    resourceId: removalRequestId,
    metadata: { reminder: "recheck" },
  });
  return { message: "Recheck reminder recorded." };
}
