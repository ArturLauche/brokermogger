import type { EmailStatus, RequestStatus } from "@prisma/client";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { classifyEmailWebhook } from "@/lib/jobs/datetime";
import { deliveryPayloadSchema } from "@/lib/email/delivery";
import { parseJobPayload } from "@/lib/jobs/payloads";
import type { ClaimedJob, JobResult } from "@/lib/jobs/types";
import { canTransition } from "@/lib/requests/stateMachine";
import { getWebhookPayload } from "./outboundEmail";
import { lockJobLeaseInTx } from "./jobLease";
import { appendRequestEventInTx, applyRequestStatusInTx } from "./requests";
import { calculateResponseTargetInTx } from "./responseTargets";

const precedence: Record<EmailStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  SUPPRESSED: 1,
  DELIVERED: 2,
  FAILED: 3,
  BOUNCED: 3,
  COMPLAINED: 4,
};

export async function applyStoredDeliveryEvent(
  webhookId: string,
  job: ClaimedJob<"PROCESS_EMAIL_WEBHOOK">
): Promise<JobResult> {
  return prisma.$transaction(async (tx) => {
    const event = await tx.emailWebhookEvent.findUnique({ where: { id: webhookId } });
    if (!event || event.processedAt)
      return { message: "Delivery event already processed or erased." };
    const payload = deliveryPayloadSchema.safeParse(getWebhookPayload(event));
    const outcome = classifyEmailWebhook(event.eventType);
    const matches = payload.success
      ? await tx.outboundEmail.findMany({
          where: { provider: "RESEND", providerMessageId: payload.data.data.email_id },
          take: 2,
        })
      : [];
    const ledger = matches.length === 1 ? matches[0]! : null;
    if (ledger?.userId)
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ledger.userId} FOR UPDATE`;
    if (ledger?.removalRequestId)
      await tx.$executeRaw`SELECT 1 FROM "RemovalRequest" WHERE id = ${ledger.removalRequestId} FOR UPDATE`;
    if (
      !(await lockJobLeaseInTx(tx, job, "PROCESS_EMAIL_WEBHOOK", {
        webhookEventId: webhookId,
      }))
    )
      return { message: "The delivery worker no longer holds its lease." };
    // Account erasure could have removed the event while the transaction waited.
    if (
      !(await tx.emailWebhookEvent.findFirst({
        where: { id: webhookId, processedAt: null },
        select: { id: true },
      }))
    )
      return { message: "Delivery event already processed or erased." };
    if (!event.signatureVerified || !payload.success || outcome === "ignored") {
      await tx.emailWebhookEvent.update({
        where: { id: webhookId },
        data: {
          processedAt: new Date(),
          processingError: "unsupported_or_invalid_event",
          payloadEnc: null,
          payloadJson: {},
        },
      });
      return { message: "Unsupported or invalid delivery event ignored." };
    }
    if (!ledger) {
      const expired = Date.now() - event.receivedAt.getTime() > 24 * 60 * 60_000;
      await tx.emailWebhookEvent.update({
        where: { id: webhookId },
        data: {
          processingError: "ledger_not_found",
          ...(expired
            ? { processedAt: new Date(), payloadEnc: null, payloadJson: {} }
            : {}),
        },
      });
      return expired
        ? { message: "Unmatched delivery event expired without changing a request." }
        : {
            message:
              "Delivery event is waiting for its provider receipt or reconciliation.",
            retryAfterSeconds: Math.min(60 * 2 ** Math.min(job.attemptCount, 8), 3600),
          };
    }
    const active = ledger.userId
      ? await tx.user.findFirst({
          where: { id: ledger.userId, status: "ACTIVE", deletionRequestedAt: null },
          select: { id: true },
        })
      : null;
    if (ledger.userId && !active) {
      await tx.emailWebhookEvent.update({
        where: { id: webhookId },
        data: {
          processedAt: new Date(),
          processingError: "account_inactive",
          payloadEnc: null,
          payloadJson: {},
        },
      });
      return { message: "Delivery event for an inactive account discarded." };
    }
    const current = await tx.outboundEmail.findUnique({ where: { id: ledger.id } });
    if (!current) return { message: "The corresponding outbound message was erased." };
    const incoming: EmailStatus =
      outcome === "delivered"
        ? "DELIVERED"
        : outcome === "bounced"
          ? "BOUNCED"
          : "COMPLAINED";
    const at = payload.data.created_at
      ? new Date(payload.data.created_at)
      : event.receivedAt;
    const advances = precedence[incoming] > precedence[current.status];
    await tx.outboundEmail.update({
      where: { id: current.id },
      data: {
        ...(advances ? { status: incoming } : {}),
        ...(outcome === "delivered" && !current.deliveredAt ? { deliveredAt: at } : {}),
        ...(outcome === "bounced" && !current.bouncedAt
          ? { bouncedAt: at, failedAt: at }
          : {}),
        ...(outcome === "complained" && !current.complainedAt
          ? { complainedAt: at }
          : {}),
      },
    });
    const request =
      current.removalRequestId && current.userId
        ? await tx.removalRequest.findFirst({
            where: {
              id: current.removalRequestId,
              userId: current.userId,
              deletedAt: null,
            },
            include: { user: { select: { timezone: true } } },
          })
        : null;
    if (request) {
      let status = request.status;
      const currentMessage = current.snapshotId === request.currentSnapshotId;
      if (advances && currentMessage) {
        let target: RequestStatus | null = null;
        if (outcome === "delivered" && request.status === "SENT") target = "DELIVERED";
        else if (outcome === "bounced" && request.status === "SENT") target = "FAILED";
        else if (
          (outcome === "bounced" || outcome === "complained") &&
          canTransition(request.status, "NEEDS_USER_ACTION", "SYSTEM")
        )
          target = "NEEDS_USER_ACTION";
        if (target) {
          await applyRequestStatusInTx(tx, {
            requestId: request.id,
            from: status,
            to: target,
            actor: "SYSTEM",
            actorUserId: null,
            message:
              outcome === "delivered"
                ? "The provider reported delivery."
                : "The provider reported a bounce or complaint. Review delivery before taking another action.",
            ...(outcome !== "delivered"
              ? { cancelPendingJobTypes: ["SEND_REQUEST", "PREPARE_FOLLOW_UP"] }
              : {}),
          });
          status = target;
          if (status === "DELIVERED") {
            await applyRequestStatusInTx(tx, {
              requestId: request.id,
              from: status,
              to: "WAITING_FOR_BROKER",
              actor: "SYSTEM",
              actorUserId: null,
              message: "Awaiting a broker reply.",
            });
            status = "WAITING_FOR_BROKER";
          }
        }
      }
      const initialDelivery =
        outcome === "delivered" &&
        current.snapshotId !== null &&
        current.snapshotId === request.deadlineSnapshotId &&
        request.deadlineBasis === "DISPATCH_ESTIMATE" &&
        !request.deliveredAt;
      const originalMessage = request.deadlineSnapshotId
        ? current.snapshotId === request.deadlineSnapshotId
        : currentMessage;
      if (advances && outcome === "delivered" && originalMessage && !request.deliveredAt)
        await tx.removalRequest.update({
          where: { id: request.id },
          data: {
            deliveredAt: at,
            ...(initialDelivery
              ? await calculateResponseTargetInTx(tx, {
                  requestId: request.id,
                  snapshotId: current.snapshotId!,
                  providerDeliveredAt: at,
                  timeZone: request.deadlineTimezone ?? request.user.timezone,
                })
              : {}),
          },
        });
      if (advances)
        await appendRequestEventInTx(tx, {
          removalRequestId: request.id,
          type: outcome === "delivered" ? "EMAIL_DELIVERED" : "EMAIL_FAILED",
          fromStatus: status,
          toStatus: status,
          actorType: "SYSTEM",
          actorUserId: null,
          message: `The provider reported ${outcome === "delivered" ? "delivery" : outcome === "bounced" ? "a bounce" : "a complaint"}${currentMessage ? "." : " for an earlier message. The current draft status was preserved."}`,
          payload: { outboundEmailId: current.id, webhookEventId: event.id },
        });
    }
    await tx.emailWebhookEvent.update({
      where: { id: webhookId },
      data: {
        processedAt: new Date(),
        processingError: null,
        outboundEmailId: current.id,
        ownerUserId: current.userId,
      },
    });
    return {
      message: "Delivery event recorded atomically with its ledger and request history.",
      metadata: { outcome, statusAdvanced: advances },
    };
  });
}

/** Reconciliation can supply the provider ID after a callback arrived too early. */
export async function requeueUnmatchedDeliveryInTx(
  tx: PrismaTransaction,
  userId: string,
  providerMessageId: string
) {
  const events = await tx.emailWebhookEvent.findMany({
    where: {
      providerMessageId,
      processedAt: null,
      eventType: { not: "email.received" },
      OR: [{ ownerUserId: null }, { ownerUserId: userId }],
    },
    select: { id: true },
    take: 100,
  });
  for (const event of events) {
    await tx.emailWebhookEvent.update({
      where: { id: event.id },
      data: { ownerUserId: userId },
    });
    await tx.backgroundJob.upsert({
      where: { idempotencyKey: `webhook:${event.id}` },
      create: {
        type: "PROCESS_EMAIL_WEBHOOK",
        payloadJson: parseJobPayload("PROCESS_EMAIL_WEBHOOK", {
          webhookEventId: event.id,
        }),
        idempotencyKey: `webhook:${event.id}`,
        relatedUserId: userId,
        maxAttempts: 12,
      },
      update: {},
    });
    await tx.backgroundJob.updateMany({
      where: {
        idempotencyKey: `webhook:${event.id}`,
        status: { in: ["FAILED", "RETRYABLE"] },
      },
      data: {
        status: "PENDING",
        runAt: new Date(),
        attemptCount: 0,
        lastError: null,
        relatedUserId: userId,
      },
    });
  }
}
