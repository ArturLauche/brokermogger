/**
 * Job handler registry used by the worker process.
 *
 * Each handler is idempotent. SEND_REQUEST relies on the outbound email unique
 * constraint so a retry cannot produce a second broker message. Persistence
 * goes through repositories so this module never imports the Prisma client.
 */
import { mapPool } from "@/lib/async/pool";
import { getSetting } from "@/lib/config/runtimeSettings";
import {
  anonymiseDeletedAccount,
  listAccountFilesForErasure,
  finishAccountErasure,
} from "@/lib/db/repositories/account";
import {
  listExpiredTemporaryEvidence,
  listRetentionDueEvidence,
  listUnfinishedFilePurges,
} from "@/lib/db/repositories/evidence";
import { listUnprocessedWebhookEvents } from "@/lib/db/repositories/outboundEmail";
import { dispatchNotificationEmail } from "@/lib/notifications/service";
import { monthsAgo } from "@/lib/jobs/datetime";
import { runDeadlineWatch, runRecheckReminder } from "@/lib/jobs/deadlineWatch";
import { processStoredEmailWebhook } from "@/lib/jobs/emailWebhook";
import { RECURRING_INTERVAL_SECONDS } from "@/lib/jobs/recurring";
import { runRetentionSweep } from "@/lib/jobs/retentionSweep";
import { enqueueJob } from "@/lib/jobs/queue";
import type { JobHandlerRegistry, JobResult } from "@/lib/jobs/types";
import { systemActor } from "@/lib/permissions/actor";
import { prepareFollowUpDraft, sendApprovedRequest } from "@/lib/requests/lifecycle";
import { purgePrivateFile } from "@/lib/storage/privateFiles";
import { recordAudit } from "@/lib/audit/service";

function recurringRepeat(
  job: { idempotencyKey: string },
  seconds: number
): { repeatAfterSeconds: number } | Record<string, never> {
  return job.idempotencyKey.startsWith("recurring:")
    ? { repeatAfterSeconds: seconds }
    : {};
}

export function createJobHandlers(): JobHandlerRegistry {
  return {
    async SEND_REQUEST(job): Promise<JobResult> {
      const actor = systemActor(job.id);
      const result = await sendApprovedRequest(
        actor,
        job.payload.removalRequestId,
        job.payload.attempt,
        job.payload.snapshotId,
        job
      );
      return { message: result.message };
    },

    async PREPARE_FOLLOW_UP(job): Promise<JobResult> {
      const actor = systemActor(job.id);
      const result = await prepareFollowUpDraft(
        actor,
        job.payload.removalRequestId,
        job.payload.followUpNumber
      );
      return { message: result.message };
    },

    async DISPATCH_NOTIFICATION(job): Promise<JobResult> {
      return dispatchNotificationEmail(job);
    },

    async PROCESS_EMAIL_WEBHOOK(job): Promise<JobResult> {
      const result = await processStoredEmailWebhook(job.payload.webhookEventId, job);
      const leftover = await listUnprocessedWebhookEvents(1);
      const next = leftover[0];
      if (next && next.id !== job.payload.webhookEventId) {
        await enqueueJob({
          type: "PROCESS_EMAIL_WEBHOOK",
          payload: { webhookEventId: next.id },
          idempotencyKey: `webhook:${next.id}`,
          maxAttempts: 12,
        });
      }
      return result;
    },

    async GENERATE_REPORT(job): Promise<JobResult> {
      const { renderReportForJob } = await import("@/lib/reports/service");
      return renderReportForJob(job);
    },

    async GENERATE_ACCOUNT_EXPORT(job): Promise<JobResult> {
      const { generateAccountExport } = await import("@/lib/exports/service");
      return generateAccountExport(job);
    },

    async DELETE_ACCOUNT_DATA(job): Promise<JobResult> {
      const actor = systemActor(job.id);
      await anonymiseDeletedAccount(actor, job.payload.userId);
      let files = await listAccountFilesForErasure(job.payload.userId);
      while (files.length > 0) {
        await mapPool(files, 5, purgePrivateFile);
        files = await listAccountFilesForErasure(job.payload.userId);
      }
      await finishAccountErasure(actor, job.payload.userId);
      await recordAudit({
        actor,
        action: "account.deletion_completed",
        resourceType: "user",
        resourceId: job.payload.userId,
        targetUserId: job.payload.userId,
      });
      return {
        message:
          "Personal content and stored files erased. Minimal pseudonymous audit and consent proof remains under the retention policy.",
      };
    },

    async PURGE_EVIDENCE(job): Promise<JobResult> {
      const months = await getSetting("retentionEvidenceMonths");
      const cutoff = monthsAgo(new Date(), months);
      const files = [
        ...(await listUnfinishedFilePurges(100)),
        ...(await listRetentionDueEvidence(cutoff, 100)),
      ];
      await mapPool(files, 5, async (file) => {
        await purgePrivateFile(file);
      });
      return {
        message: `Purged ${files.length} evidence files.`,
        ...recurringRepeat(job, RECURRING_INTERVAL_SECONDS.PURGE_EVIDENCE),
      };
    },

    async PURGE_TEMP_ID_FILES(job): Promise<JobResult> {
      const files = await listExpiredTemporaryEvidence(100);
      await mapPool(files, 5, async (file) => {
        await purgePrivateFile(file);
      });
      return {
        message: `Purged ${files.length} expired temporary files.`,
        ...recurringRepeat(job, RECURRING_INTERVAL_SECONDS.PURGE_TEMP_ID_FILES),
      };
    },

    async DEADLINE_WATCH(job): Promise<JobResult> {
      const result = await runDeadlineWatch(job.payload.windowDays);
      return {
        ...result,
        ...recurringRepeat(job, RECURRING_INTERVAL_SECONDS.DEADLINE_WATCH),
      };
    },

    async RECHECK_REMINDER(job): Promise<JobResult> {
      return runRecheckReminder(job.payload.removalRequestId);
    },

    async RETENTION_SWEEP(job): Promise<JobResult> {
      const result = await runRetentionSweep({ dryRun: job.payload.dryRun });
      if (job.payload.dryRun) {
        return result;
      }
      return {
        ...result,
        ...recurringRepeat(job, RECURRING_INTERVAL_SECONDS.RETENTION_SWEEP),
      };
    },
  };
}
