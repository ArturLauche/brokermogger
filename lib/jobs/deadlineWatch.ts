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
import type { DeadlineCursor } from "@/lib/db/repositories/requests";
import { checkpointDeadlineWatchProgress } from "@/lib/db/repositories/deadlineProgress";
import { hasCurrentLease } from "@/lib/db/repositories/jobs";
import { parseJobPayload } from "./payloads";
import { createLogger } from "@/lib/observability/logger";
import { systemActor } from "@/lib/permissions/actor";

import { daysFromNow } from "./datetime";
import type { JobResult, JobLease, DeadlineWatchProgress } from "./types";

const log = createLogger("jobs.deadlines");
const BATCH = 50;
const MAX_BATCHES = 20;

export { isRecheckReminderApplicable } from "@/lib/requests/reminders";

export async function runDeadlineWatch(
  windowDays: number,
  job: JobLease,
  savedProgress?: DeadlineWatchProgress
): Promise<JobResult> {
  const input = parseJobPayload("DEADLINE_WATCH", {
    windowDays,
    progress: savedProgress,
  });
  const now = input.progress ? new Date(input.progress.now) : new Date();
  const warningDays = await getSetting("followUpDeadlineWarningDays");
  const firstReminderDays = await getSetting("followUpFirstReminderDays");
  const maxFollowUps = await getSetting("followUpMaxAttempts");
  const actor = systemActor(job.id);
  const warningBefore = input.progress
    ? new Date(input.progress.warningBefore)
    : daysFromNow(now, Math.min(windowDays, warningDays));
  const progress: DeadlineWatchProgress = input.progress ?? {
    now: now.toISOString(),
    warningBefore: warningBefore.toISOString(),
    warningsDone: false,
  };
  const resumeCursor = (
    cursor: DeadlineWatchProgress["warningAfter"]
  ): DeadlineCursor | undefined =>
    cursor ? { id: cursor.id, deadlineAt: new Date(cursor.deadlineAt) } : undefined;
  const stopped = {
    message: "Deadline scan stopped because its worker lease is no longer current.",
  };

  let warned = 0;
  let warningCursor = resumeCursor(progress.warningAfter);
  for (let i = 0; !progress.warningsDone && i < MAX_BATCHES; i += 1) {
    if (!(await hasCurrentLease(job))) return stopped;
    const warnings = await listDeadlineWarningRequests({
      now,
      warningBefore,
      take: BATCH,
      ...(warningCursor ? { after: warningCursor } : {}),
    });
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
    progress.warningsDone = warnings.length < BATCH;
    if (warnings.length === BATCH) {
      const last = warnings.at(-1)!;
      warningCursor = { deadlineAt: last.deadlineAt!, id: last.id };
      progress.warningAfter = { deadlineAt: last.deadlineAt!.toISOString(), id: last.id };
    }
    if (!(await checkpointDeadlineWatchProgress(job, progress))) return stopped;
  }

  const seenOverdue = new Set<string>();
  let overdueCursor = resumeCursor(progress.overdueAfter);
  let overdueDone = false;
  let marked = 0;
  let followUpsQueued = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    if (!(await hasCurrentLease(job))) return stopped;
    const overdue = await listOverdueWaitingRequests(now, BATCH, overdueCursor);
    const fresh = overdue.filter((request) => !seenOverdue.has(request.id));
    if (fresh.length === 0 && overdue.length > 0) break;
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
    overdueDone = overdue.length < BATCH;
    if (overdue.length === BATCH) {
      const last = overdue.at(-1)!;
      overdueCursor = { deadlineAt: last.deadlineAt!, id: last.id };
      progress.overdueAfter = { deadlineAt: last.deadlineAt!.toISOString(), id: last.id };
    }
    if (!(await checkpointDeadlineWatchProgress(job, progress))) return stopped;
    if (overdueDone) break;
  }

  const complete = progress.warningsDone && overdueDone;
  if (complete && !(await checkpointDeadlineWatchProgress(job))) return stopped;

  log.info({ warned, marked, followUpsQueued }, "Deadline watch pass complete");
  return {
    message: "Deadline watch pass complete.",
    metadata: { warned, marked, followUpsQueued },
    ...(!complete ? { repeatAfterSeconds: 1 } : {}),
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
