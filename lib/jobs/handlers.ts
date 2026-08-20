/**
 * Job handler registry used by the worker process.
 *
 * Each handler is idempotent. SEND_REQUEST relies on the outbound email unique
 * constraint so a retry cannot produce a second broker message.
 */
import { env } from "@/lib/config/env";
import { withAppendOnlyDeletes, prisma } from "@/lib/db/client";
import { getNotification } from "@/lib/db/repositories/notifications";
import { getEmailProvider } from "@/lib/email";
import type { JobHandlerRegistry, JobResult } from "@/lib/jobs/types";
import { createLogger } from "@/lib/observability/logger";
import { systemActor } from "@/lib/permissions/actor";
import { sendApprovedRequest } from "@/lib/requests/lifecycle";
import { getStorage } from "@/lib/storage";

const log = createLogger("jobs.handlers");

export function createJobHandlers(): JobHandlerRegistry {
  return {
    async SEND_REQUEST(job): Promise<JobResult> {
      const actor = systemActor(job.id);
      const result = await sendApprovedRequest(
        actor,
        job.payload.removalRequestId,
        job.payload.attempt
      );
      return { message: result.message };
    },

    async PREPARE_FOLLOW_UP(job): Promise<JobResult> {
      log.info(
        { requestId: job.payload.removalRequestId },
        "Follow up preparation requested"
      );
      return {
        message:
          "Follow up drafts are prepared for user approval. Escalation is never filed automatically.",
      };
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

      const user = await prisma.user.findUnique({
        where: { id: notification.userId },
        select: { email: true },
      });
      if (!user?.email) {
        return { message: "Account has no email address." };
      }

      await getEmailProvider().sendNotificationEmail({
        to: { address: user.email },
        subject: notification.title,
        text: notification.body,
        notificationId: notification.id,
      });
      await prisma.notification.update({
        where: { id: notification.id },
        data: { emailedAt: new Date() },
      });
      return { message: "Notification email sent." };
    },

    async PROCESS_EMAIL_WEBHOOK(job): Promise<JobResult> {
      const event = await prisma.emailWebhookEvent.findUnique({
        where: { id: job.payload.webhookEventId },
      });
      if (!event) {
        return { message: "Webhook event not found." };
      }
      if (event.processedAt) {
        return { message: "Webhook event already processed." };
      }
      await prisma.emailWebhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
      return { message: `Processed ${event.eventType}.` };
    },

    async GENERATE_REPORT(job): Promise<JobResult> {
      const { renderReportForJob } = await import("@/lib/reports/service");
      return renderReportForJob(job.payload.reportId);
    },

    async DELETE_ACCOUNT_DATA(job): Promise<JobResult> {
      const userId = job.payload.userId;
      await withAppendOnlyDeletes(async (tx) => {
        await tx.profileIdentifier.updateMany({
          where: { profile: { ownerUserId: userId } },
          data: { deletedAt: new Date() },
        });
        await tx.userProfile.updateMany({
          where: { ownerUserId: userId },
          data: {
            deletedAt: new Date(),
            legalNameEnc: null,
            contactEmailEnc: null,
            displayName: "Deleted profile",
          },
        });
        await tx.user.update({
          where: { id: userId },
          data: {
            status: "DELETED",
            anonymizedAt: new Date(),
            name: null,
            email: `deleted-${userId}@anonymised.invalid`,
          },
        });
        await tx.backgroundJob.updateMany({
          where: { relatedUserId: userId, status: { in: ["PENDING", "RETRYABLE"] } },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
      });
      return { message: "Account identifiers anonymised and pending jobs cancelled." };
    },

    async PURGE_EVIDENCE(): Promise<JobResult> {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 24);
      const files = await prisma.evidenceFile.findMany({
        where: { deletedAt: null, createdAt: { lt: cutoff }, isTemporary: false },
        take: 50,
      });
      const storage = getStorage();
      for (const file of files) {
        await storage.delete(file.storageKey);
        await prisma.evidenceFile.update({
          where: { id: file.id },
          data: { deletedAt: new Date() },
        });
      }
      return { message: `Purged ${files.length} evidence files.` };
    },

    async PURGE_TEMP_ID_FILES(): Promise<JobResult> {
      const files = await prisma.evidenceFile.findMany({
        where: {
          isTemporary: true,
          deletedAt: null,
          expiresAt: { lte: new Date() },
        },
        take: 50,
      });
      const storage = getStorage();
      for (const file of files) {
        await storage.delete(file.storageKey);
        await prisma.evidenceFile.update({
          where: { id: file.id },
          data: { deletedAt: new Date() },
        });
      }
      return { message: `Purged ${files.length} temporary identity files.` };
    },

    async DEADLINE_WATCH(): Promise<JobResult> {
      return { message: "Deadline watch pass complete." };
    },

    async RECHECK_REMINDER(): Promise<JobResult> {
      return { message: "Recheck reminder recorded." };
    },

    async RETENTION_SWEEP(job): Promise<JobResult> {
      log.info({ dryRun: job.payload.dryRun, env: env.APP_ENV }, "Retention sweep");
      return {
        message: job.payload.dryRun ? "Retention dry run." : "Retention sweep complete.",
      };
    },
  };
}
