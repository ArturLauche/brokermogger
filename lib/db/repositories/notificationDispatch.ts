import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config/env";
import type { SendResult } from "@/lib/email/types";
import type { ClaimedJob } from "@/lib/jobs/types";
import { notificationPreferences } from "@/lib/notifications/preferences";
import { needsDeliveryReconciliation } from "@/lib/requests/dispatchPolicy";
import { WAITING_STATUSES } from "@/lib/requests/stateMachine";
import { readAccountEmail } from "@/lib/security/accountEmail";
import { lockJobLeaseInTx } from "./jobLease";

type NotificationJob = ClaimedJob<"DISPATCH_NOTIFICATION">;
const reminderStates = new Set([
  ...WAITING_STATUSES,
  "NO_RESPONSE",
  "FOLLOW_UP_SCHEDULED",
  "ESCALATION_RECOMMENDED",
  "PARTIALLY_COMPLETED",
]);

/** The account lock orders opt-out/deletion against dispatch; the lease fences stale workers. */
export async function beginNotificationEmail(job: NotificationJob) {
  return prisma.$transaction(async (tx) => {
    const ref = await tx.notification.findUnique({
      where: { id: job.payload.notificationId },
      select: { userId: true },
    });
    if (!ref) return null;
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ref.userId} FOR UPDATE`;
    if (
      !(await lockJobLeaseInTx(tx, job, "DISPATCH_NOTIFICATION", {
        notificationId: job.payload.notificationId,
      }))
    )
      return null;
    const user = await tx.user.findFirst({
      where: { id: ref.userId, status: "ACTIVE", deletionRequestedAt: null },
      select: {
        id: true,
        email: true,
        emailEnc: true,
        emailVerified: true,
        preferences: true,
      },
    });
    const notification = await tx.notification.findUnique({
      where: { id: job.payload.notificationId },
      include: { removalRequest: { select: { status: true, deletedAt: true } } },
    });
    if (!user || !notification || notification.emailedAt) return null;
    const prefs = notificationPreferences(user.preferences);
    const staleReminder =
      ["DEADLINE_APPROACHING", "RECHECK_RECOMMENDED"].includes(notification.type) &&
      (!notification.removalRequest ||
        notification.removalRequest.deletedAt ||
        !reminderStates.has(notification.removalRequest.status));
    if (
      !user.emailVerified ||
      !prefs?.emailEnabled ||
      !notification.emailConsentId ||
      notification.emailConsentId !== prefs.emailConsentId ||
      notification.channel !== "EMAIL" ||
      notification.readAt ||
      notification.dismissedAt ||
      staleReminder
    ) {
      await tx.notification.update({
        where: { id: notification.id },
        data: {
          emailDispatchState: notification.emailDispatchStartedAt
            ? "AMBIGUOUS"
            : "CANCELLED",
          emailLeaseToken: null,
        },
      });
      return null;
    }
    if (
      notification.emailDispatchState === "ACCEPTED" ||
      notification.emailDispatchState === "CANCELLED" ||
      notification.emailDispatchState === "RECONCILIATION_REQUIRED"
    )
      return null;
    const provider =
      env.EMAIL_PROVIDER === "mock"
        ? "MOCK"
        : env.EMAIL_PROVIDER === "sandbox"
          ? "SANDBOX"
          : "RESEND";
    if (
      needsDeliveryReconciliation(notification.emailDispatchStartedAt) ||
      (notification.emailProvider && notification.emailProvider !== provider)
    ) {
      await tx.notification.update({
        where: { id: notification.id },
        data: { emailDispatchState: "RECONCILIATION_REQUIRED", emailLeaseToken: null },
      });
      return null;
    }
    if (
      notification.emailDispatchState === "DISPATCHING" &&
      notification.emailLeaseToken === job.leaseToken
    )
      return null;
    await tx.notification.update({
      where: { id: notification.id },
      data: {
        emailDispatchState: "DISPATCHING",
        emailDispatchStartedAt: notification.emailDispatchStartedAt ?? new Date(),
        emailLeaseToken: job.leaseToken,
        emailProvider: provider,
      },
    });
    return { id: notification.id, address: readAccountEmail(user).email };
  });
}

export async function finishNotificationEmail(
  job: NotificationJob,
  result: SendResult | null
) {
  return prisma.$transaction(async (tx) => {
    const ref = await tx.notification.findUnique({
      where: { id: job.payload.notificationId },
      select: { userId: true },
    });
    if (!ref) return false;
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ref.userId} FOR UPDATE`;
    if (
      !(await lockJobLeaseInTx(tx, job, "DISPATCH_NOTIFICATION", {
        notificationId: job.payload.notificationId,
      }))
    )
      return false;
    const active = await tx.user.findFirst({
      where: { id: ref.userId, status: "ACTIVE", deletionRequestedAt: null },
      select: { id: true },
    });
    if (!active) return false;
    const completed = result && (result.dispatched || result.provider === "MOCK");
    return (
      (
        await tx.notification.updateMany({
          where: {
            id: job.payload.notificationId,
            emailLeaseToken: job.leaseToken,
            emailDispatchState: "DISPATCHING",
          },
          data: {
            emailDispatchState: result
              ? completed
                ? "ACCEPTED"
                : "CANCELLED"
              : "AMBIGUOUS",
            emailLeaseToken: null,
            ...(result ? { emailProvider: result.provider } : {}),
            ...(completed ? { emailedAt: result.sentAt } : {}),
          },
        })
      ).count === 1
    );
  });
}
