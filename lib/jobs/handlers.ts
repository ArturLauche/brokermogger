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
  findAccountEmailById,
} from "@/lib/db/repositories/account";
import {
  listExpiredTemporaryEvidence,
  listRetentionDueEvidence,
  markEvidencePurged,
} from "@/lib/db/repositories/evidence";
import {
  getNotification,
  markNotificationEmailed,
} from "@/lib/db/repositories/notifications";
import { listUnprocessedWebhookEvents } from "@/lib/db/repositories/outboundEmail";
import { getEmailProvider } from "@/lib/email";
import { monthsAgo } from "@/lib/jobs/datetime";
import { runDeadlineWatch, runRecheckReminder } from "@/lib/jobs/deadlineWatch";
import { processStoredEmailWebhook } from "@/lib/jobs/emailWebhook";
import { RECURRING_INTERVAL_SECONDS } from "@/lib/jobs/recurring";
import { runRetentionSweep } from "@/lib/jobs/retentionSweep";
import { enqueueJob } from "@/lib/jobs/queue";
import type { JobHandlerRegistry, JobResult } from "@/lib/jobs/types";
import { systemActor } from "@/lib/permissions/actor";
import { prepareFollowUpDraft, sendApprovedRequest } from "@/lib/requests/lifecycle";
import { getStorage } from "@/lib/storage";

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
        job.payload.snapshotId
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
      const notification = await getNotification(job.payload.notificationId);
      if (!notification) {
        return { message: "Notification no longer exists." };
      }
      if (notification.emailedAt) {
        return { message: "Notification email already sent." };
      }
      if (notification.channel !== "EMAIL") {
        return { message: "In-app notification only." };
      }

      const email = await findAccountEmailById(notification.userId);
      if (!email) {
        return { message: "Account has no email address." };
      }

      await getEmailProvider().sendNotificationEmail({
        to: { address: email },
        subject: notification.title,
        text: notification.body,
        notificationId: notification.id,
      });
      await markNotificationEmailed(notification.id);
      return { message: "Notification email sent." };
    },

    async PROCESS_EMAIL_WEBHOOK(job): Promise<JobResult> {
      const result = await processStoredEmailWebhook(job.payload.webhookEventId);
      const leftover = await listUnprocessedWebhookEvents(1);
      const next = leftover[0];
      if (next && next.id !== job.payload.webhookEventId) {
        await enqueueJob({
          type: "PROCESS_EMAIL_WEBHOOK",
          payload: { webhookEventId: next.id },
          idempotencyKey: `webhook:${next.id}`,
        });
      }
      return result;
    },

    async GENERATE_REPORT(job): Promise<JobResult> {
      const { renderReportForJob } = await import("@/lib/reports/service");
      return renderReportForJob(job.payload.reportId);
    },

    async DELETE_ACCOUNT_DATA(job): Promise<JobResult> {
      const actor = systemActor(job.id);
      await anonymiseDeletedAccount(actor, job.payload.userId);
      return { message: "Account identifiers anonymised and pending jobs cancelled." };
    },

    async PURGE_EVIDENCE(job): Promise<JobResult> {
      const months = await getSetting("retentionEvidenceMonths");
      const cutoff = monthsAgo(new Date(), months);
      const files = await listRetentionDueEvidence(cutoff, 100);
      const storage = getStorage();
      await mapPool(files, 5, async (file) => {
        await storage.delete(file.storageKey);
        await markEvidencePurged(file.id);
      });
      return {
        message: `Purged ${files.length} evidence files.`,
        ...recurringRepeat(job, RECURRING_INTERVAL_SECONDS.PURGE_EVIDENCE),
      };
    },

    async PURGE_TEMP_ID_FILES(job): Promise<JobResult> {
      const files = await listExpiredTemporaryEvidence(100);
      const storage = getStorage();
      await mapPool(files, 5, async (file) => {
        await storage.delete(file.storageKey);
        await markEvidencePurged(file.id);
      });
      return {
        message: `Purged ${files.length} temporary identity files.`,
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
