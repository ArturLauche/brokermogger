import { createNotificationInTx } from "./notifications";
import type { PrismaTransaction } from "@/lib/db/client";
import { prisma } from "@/lib/db/client";
import { evaluateBrokerSendable } from "@/lib/brokers/sendable";
import { env } from "@/lib/config/env";
import { SETTINGS } from "@/lib/config/systemSettings";
import { AppError } from "@/lib/core/errors";
import { assertAdminSendingEnabled, assertOutboundAllowed } from "@/lib/email/guards";
import type { EmailMessage, SendResult } from "@/lib/email/types";
import { validateOutboundMessage } from "@/lib/email/validate";
import { parseJobPayload } from "@/lib/jobs/payloads";
import type { JobLease } from "@/lib/jobs/types";
import type { ActorContext } from "@/lib/permissions/actor";
import { needsDeliveryReconciliation } from "@/lib/requests/dispatchPolicy";
import { sha256Hex } from "@/lib/security/crypto";

import { readApprovedMessageInTx } from "./requestApprovedMessage";
import { loadRequestForDecision } from "./requestDecision";
import { applyRequestStatusInTx } from "./requests";

async function leaseInTx(tx: PrismaTransaction, job: JobLease, requestId: string) {
  const rows = await tx.$queryRaw<{ payloadJson: unknown }[]>`
    SELECT "payloadJson" FROM "BackgroundJob" WHERE id = ${job.id} AND "leaseToken" = ${job.leaseToken}
      AND type = 'SEND_REQUEST' AND "relatedRequestId" = ${requestId} AND status = 'RUNNING' AND "lockExpiresAt" > NOW() FOR UPDATE
  `;
  return rows[0] ? parseJobPayload("SEND_REQUEST", rows[0].payloadJson) : null;
}

export interface DispatchCommand {
  requestId: string;
  snapshotId: string;
  attempt: number;
  job: JobLease;
}
export type DispatchPreparation =
  | { kind: "stopped"; message: string }
  | {
      kind: "ready";
      ledgerId: string;
      brokerId: string;
      message: EmailMessage;
      firstAttempt: boolean;
    };

/** Marks the start of dispatch only after re-reading all live gates in one transaction. */
export async function beginApprovedDispatch(
  actor: ActorContext,
  input: DispatchCommand,
  reserveDispatch = true
): Promise<DispatchPreparation> {
  return prisma.$transaction(
    async (tx) => {
      const request = await loadRequestForDecision(
        tx,
        actor,
        input.requestId,
        "request:send"
      );
      const leased = await leaseInTx(tx, input.job, request.id);
      if (
        !leased ||
        leased.snapshotId !== input.snapshotId ||
        leased.attempt !== input.attempt
      )
        return { kind: "stopped", message: "The send job no longer holds its lease." };
      if (request.status !== "APPROVED")
        return {
          kind: "stopped",
          message: "This request is no longer queued for dispatch.",
        };
      const { snapshot, envelope, text, proof } = await readApprovedMessageInTx(
        tx,
        request,
        input.snapshotId
      );
      const purpose = envelope.followUpNumber > 0 ? "BROKER_FOLLOW_UP" : "BROKER_REQUEST";
      const ledger = await tx.outboundEmail.findUnique({
        where: {
          removalRequestId_purpose_attempt: {
            removalRequestId: request.id,
            purpose,
            attempt: input.attempt,
          },
        },
      });
      if (
        !ledger ||
        ledger.snapshotId !== snapshot.id ||
        ledger.approvalEnvelopeHash !== snapshot.envelopeHash ||
        ledger.approvalConsentRecordId !== proof.id ||
        ledger.bodyHash !== sha256Hex(text.body) ||
        !ledger.idempotencyKey
      )
        throw new AppError({
          code: "CONFLICT",
          message: "The queued send does not match this approval.",
        });
      if (ledger.dispatchState === "ACCEPTED" || ledger.dispatchState === "CANCELLED")
        return { kind: "stopped", message: "This send attempt has already concluded." };
      if (
        ledger.dispatchState === "RECONCILIATION_REQUIRED" ||
        needsDeliveryReconciliation(ledger.dispatchStartedAt)
      ) {
        await tx.outboundEmail.update({
          where: { id: ledger.id },
          data: {
            dispatchState: "RECONCILIATION_REQUIRED",
            dispatchToken: null,
            lastError:
              "The safe provider replay window has ended. Confirm the provider outcome before taking further action.",
          },
        });
        await applyRequestStatusInTx(tx, {
          requestId: request.id,
          from: "APPROVED",
          to: "NEEDS_USER_ACTION",
          actor: "SYSTEM",
          actorUserId: null,
          message:
            "Delivery is uncertain and the provider’s idempotency window has ended. Automatic sending stopped. Check provider records; starting another message may duplicate a request.",
        });
        return {
          kind: "stopped",
          message: "Provider reconciliation is required; no automatic retry was sent.",
        };
      }
      const configuredProvider =
        env.EMAIL_PROVIDER === "mock"
          ? "MOCK"
          : env.EMAIL_PROVIDER === "sandbox"
            ? "SANDBOX"
            : "RESEND";
      if (ledger.provider !== configuredProvider)
        throw new AppError({
          code: "CONFLICT",
          message: "The email provider changed after approval. Prepare a fresh message.",
        });
      const contact = request.broker.contactMethods.find(
        (row) =>
          row.isActive &&
          row.type === envelope.destinationType &&
          row.value === envelope.destination
      );
      if (!contact || !request.broker.isActive || request.broker.deletedAt)
        throw new AppError({
          code: "BROKER_NOT_SENDABLE",
          message: "The approved broker destination is no longer active.",
        });
      if (env.EMAIL_PROVIDER !== "mock") {
        const decision = evaluateBrokerSendable({
          ...request.broker,
          contactMethods: contact.isVerified ? [contact] : [],
          hasJurisdictionCoverage: request.broker.jurisdictionCoverage.some(
            (row) => row.jurisdictionId === request.jurisdictionId && row.isActive
          ),
        });
        if (!decision.sendable)
          throw new AppError({
            code: "BROKER_NOT_SENDABLE",
            message: decision.reasons[0] ?? "This broker is not eligible for sending.",
          });
      }
      assertOutboundAllowed(purpose);
      // Sending switches deliberately bypass the general settings cache.
      const setting = await tx.systemSetting.findUnique({
        where: { key: SETTINGS.sendingEnabledByAdmin.key },
        select: { valueJson: true },
      });
      const settingValue = SETTINGS.sendingEnabledByAdmin.schema.safeParse(
        setting?.valueJson ?? false
      );
      assertAdminSendingEnabled(purpose, settingValue.success && settingValue.data);
      const message = validateOutboundMessage({
        to: { address: envelope.destination! },
        replyTo: envelope.replyTo,
        subject: text.subject,
        text: text.body,
        purpose,
        idempotencyKey: ledger.idempotencyKey,
        tags: { purpose: purpose.toLowerCase(), attempt: String(input.attempt) },
      });
      if (message.text !== text.body || message.subject !== text.subject)
        throw new AppError({
          code: "CONFLICT",
          message: "The message requires normalization. Regenerate it before approval.",
        });
      if (
        reserveDispatch &&
        ledger.dispatchState === "DISPATCHING" &&
        ledger.dispatchToken === input.job.leaseToken
      )
        return {
          kind: "stopped",
          message: "This worker has already started the provider operation.",
        };
      if (reserveDispatch)
        await tx.outboundEmail.update({
          where: { id: ledger.id },
          data: {
            dispatchState: "DISPATCHING",
            dispatchToken: input.job.leaseToken,
            dispatchStartedAt: ledger.dispatchStartedAt ?? new Date(),
            lastDispatchAt: new Date(),
            lastError: null,
          },
        });
      return {
        kind: "ready",
        ledgerId: ledger.id,
        brokerId: request.brokerId,
        message,
        firstAttempt: ledger.dispatchStartedAt === null,
      };
    },
    { timeout: 15_000 }
  );
}

/** A provider receipt and the status trail commit together, fenced by the current lease. */
export async function finishApprovedDispatch(
  input: DispatchCommand & { ledgerId: string; result: SendResult }
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Serialize with close/erase without relying on an actor captured before sending.
    const ref = await tx.removalRequest.findFirst({
      where: { id: input.requestId, deletedAt: null },
      select: { userId: true },
    });
    if (!ref) return false;
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ref.userId} FOR UPDATE`;
    await tx.$executeRaw`SELECT 1 FROM "RemovalRequest" WHERE id = ${input.requestId} FOR UPDATE`;
    if (!(await leaseInTx(tx, input.job, input.requestId))) return false;
    const request = await tx.removalRequest.findFirst({
      where: {
        id: input.requestId,
        deletedAt: null,
        user: { status: "ACTIVE", deletionRequestedAt: null },
      },
    });
    if (!request) return false;
    const changed = await tx.outboundEmail.updateMany({
      where: {
        id: input.ledgerId,
        dispatchToken: input.job.leaseToken,
        dispatchState: "DISPATCHING",
      },
      data: {
        dispatchState: "ACCEPTED",
        dispatchToken: null,
        status: input.result.dispatched ? "SENT" : "SUPPRESSED",
        providerMessageId: input.result.providerMessageId,
        sentAt: input.result.sentAt,
        metadata: {
          dispatched: input.result.dispatched,
          capturedLocally: input.result.provider === "MOCK",
        },
      },
    });
    if (changed.count !== 1) return false;
    const simulated = input.result.provider === "MOCK";
    const sent = input.result.dispatched || simulated;
    if (
      request.status === "APPROVED" &&
      request.approvedSnapshotId === input.snapshotId
    ) {
      await applyRequestStatusInTx(tx, {
        requestId: request.id,
        from: "APPROVED",
        to: "SENT",
        actor: "SYSTEM",
        actorUserId: null,
        message: simulated
          ? "Approved message captured locally for simulation. Nothing left the instance."
          : "The email provider accepted the approved message.",
      });
      await tx.removalRequest.update({
        where: { id: request.id },
        data: { sentAt: input.result.sentAt },
      });
      await applyRequestStatusInTx(tx, {
        requestId: request.id,
        from: "SENT",
        to: sent ? "WAITING_FOR_BROKER" : "FAILED",
        actor: "SYSTEM",
        actorUserId: null,
        message: simulated
          ? "Simulated dispatch complete. A response can be recorded to exercise the workflow."
          : sent
            ? "Awaiting a broker reply. Acceptance does not guarantee delivery or removal."
            : "The provider suppressed delivery.",
      });
      await createNotificationInTx(tx, {
        userId: request.userId,
        profileId: request.profileId,
        removalRequestId: request.id,
        type: "REQUEST_SENT",
        title: simulated
          ? "Dispatch simulated"
          : sent
            ? "Request sent"
            : "Request not sent",
        body: simulated
          ? "Your approved request was captured locally. Nothing left the instance."
          : sent
            ? "The provider accepted your approved message. Delivery will be tracked separately."
            : "Check the request for the next step.",
        actionUrl: `/requests/${request.id}`,
        dedupeKey: `request-sent:${input.ledgerId}`,
      });
    }
    return true;
  });
}

export async function recordAmbiguousDispatch(
  input: DispatchCommand & { ledgerId: string }
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    if (!(await leaseInTx(tx, input.job, input.requestId))) return false;
    const changed = await tx.outboundEmail.updateMany({
      where: {
        id: input.ledgerId,
        dispatchToken: input.job.leaseToken,
        dispatchState: "DISPATCHING",
      },
      data: {
        dispatchState: "AMBIGUOUS",
        dispatchToken: null,
        lastError:
          "The provider outcome is uncertain. Only the same immutable message may be replayed within its safe idempotency window.",
      },
    });
    return changed.count === 1;
  });
}
