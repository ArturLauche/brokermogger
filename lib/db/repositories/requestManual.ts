import { AppError } from "@/lib/core/errors";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { dateInTimeZone, formatIsoDate } from "@/lib/format/datetime";
import type { ActorContext } from "@/lib/permissions/actor";
import type {
  ManualSubmissionCommand,
  ReconciliationCommand,
  VerificationActionCommand,
} from "@/lib/requests/manual";
import { readApprovedMessageInTx } from "./requestApprovedMessage";
import { loadRequestForDecision } from "./requestDecision";
import { appendRequestEventInTx, applyRequestStatusInTx } from "./requests";
import { requeueUnmatchedDeliveryInTx } from "./deliveryEvents";
import { calculateResponseTargetInTx } from "./responseTargets";

export async function getApprovedManualMessage(actor: ActorContext, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(
      tx,
      actor,
      requestId,
      "request:recordOutcome"
    );
    if (request.channel === "EMAIL" || !request.approvedSnapshotId)
      throw new AppError({
        code: "CONFLICT",
        message: "Review and approve a manual message before downloading it.",
      });
    const { text, envelope } = await readApprovedMessageInTx(
      tx,
      request,
      request.approvedSnapshotId
    );
    return { subject: text.subject, body: text.body, envelope };
  });
}

export async function persistManualSubmission(
  actor: ActorContext,
  input: ManualSubmissionCommand
) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(
      tx,
      actor,
      input.requestId,
      "request:recordOutcome"
    );
    const existing = await tx.manualSubmission.findUnique({
      where: { snapshotId: input.snapshotId },
    });
    if (existing) {
      if (existing.removalRequestId !== request.id)
        throw new AppError({
          code: "FORBIDDEN",
          message: "This submission does not belong to this request.",
        });
      return { requestId: request.id, alreadyRecorded: true };
    }
    if (request.channel === "EMAIL" || request.status !== "NEEDS_USER_ACTION")
      throw new AppError({
        code: "CONFLICT",
        message:
          "Approve a request that uses a manual channel before recording submission.",
      });
    const { snapshot } = await readApprovedMessageInTx(tx, request, input.snapshotId);
    const today = dateInTimeZone(new Date(), request.user.timezone);
    for (const field of ["submittedOn", "receivedOn"] as const) {
      if (input[field] && formatIsoDate(input[field]) > today)
        throw new AppError({
          code: "VALIDATION_FAILED",
          message: "Submission and receipt dates cannot be in the future.",
          details: {
            fieldErrors: {
              [field]: `Choose a date no later than ${today} (${request.user.timezone}).`,
            },
          },
        });
    }
    if (
      request.approvedAt &&
      formatIsoDate(input.submittedOn) <
        dateInTimeZone(request.approvedAt, request.user.timezone)
    )
      throw new AppError({
        code: "VALIDATION_FAILED",
        message:
          "Submission cannot predate approval. Record only the submission of this approved message.",
        details: { fieldErrors: { submittedOn: "Choose a date on or after approval." } },
      });
    if (
      input.evidenceFileId &&
      !(await tx.evidenceFile.findFirst({
        where: {
          id: input.evidenceFileId,
          userId: request.userId,
          deletedAt: null,
          storageState: "READY",
          kind: { not: "IDENTITY_DOCUMENT" },
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
          OR: [
            { removalRequestId: request.id },
            { removalRequestId: null, profileId: request.profileId },
          ],
        },
        select: { id: true },
      }))
    )
      throw new AppError({
        code: "FORBIDDEN",
        message: "The evidence file is not available for this request.",
      });
    const submitted = await tx.manualSubmission.create({
      data: {
        removalRequestId: request.id,
        snapshotId: snapshot.id,
        submittedOn: input.submittedOn,
        receivedOn: input.receivedOn,
        evidenceFileId: input.evidenceFileId,
        recordedByUserId: actor.userId,
      },
    });
    await tx.removalRequest.update({
      where: { id: request.id },
      data: {
        sentAt: request.sentAt ?? input.submittedOn,
        ...(!request.sentAt
          ? await calculateResponseTargetInTx(tx, {
              requestId: request.id,
              snapshotId: snapshot.id,
              submittedOn: formatIsoDate(input.submittedOn),
              receiptOn: input.receivedOn ? formatIsoDate(input.receivedOn) : null,
              timeZone: request.user.timezone,
            })
          : {}),
        ...(input.receivedOn && !request.sentAt && !request.deliveredAt
          ? { deliveredAt: input.receivedOn }
          : {}),
      },
    });
    await applyRequestStatusInTx(tx, {
      requestId: request.id,
      from: request.status,
      to: "WAITING_FOR_BROKER",
      actor: "USER",
      actorUserId: actor.userId,
      message: "The account holder recorded manual submission of the approved message.",
    });
    await appendRequestEventInTx(tx, {
      removalRequestId: request.id,
      type: "NOTE",
      fromStatus: "WAITING_FOR_BROKER",
      toStatus: "WAITING_FOR_BROKER",
      actorType: "USER",
      actorUserId: actor.userId,
      message:
        "Submission dates were supplied by the account holder, not confirmed by the broker.",
      payload: {
        submissionId: submitted.id,
        snapshotId: snapshot.id,
        submittedOn: input.submittedOn.toISOString().slice(0, 10),
        receivedOn: input.receivedOn?.toISOString().slice(0, 10) ?? null,
      },
    });
    return { requestId: request.id, alreadyRecorded: false };
  });
}

export async function persistDeliveryReconciliation(
  actor: ActorContext,
  input: ReconciliationCommand
) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(
      tx,
      actor,
      input.requestId,
      "request:recordOutcome"
    );
    // Fence a claim/reclaim between the live-worker check and owner confirmation.
    await tx.$executeRaw`SELECT 1 FROM "BackgroundJob" WHERE "relatedRequestId" = ${request.id} AND type = 'SEND_REQUEST' FOR UPDATE`;
    const running = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "BackgroundJob"
      WHERE "relatedRequestId" = ${request.id} AND type = 'SEND_REQUEST'
        AND status = 'RUNNING' AND "lockExpiresAt" > NOW()`;
    if (running.length)
      throw new AppError({
        code: "CONFLICT",
        message:
          "A send worker is still running. Wait for its result before reconciling delivery.",
      });
    const ledger = await tx.outboundEmail.findFirst({
      where: {
        id: input.outboundEmailId,
        removalRequestId: request.id,
        userId: request.userId,
      },
    });
    if (!ledger)
      throw new AppError({
        code: "FORBIDDEN",
        message: "This send attempt does not belong to the request.",
      });
    const accepted = input.outcome === "accepted";
    if (ledger.reconciledAt) {
      if ((ledger.dispatchState === "ACCEPTED") !== accepted)
        throw new AppError({
          code: "CONFLICT",
          message: "This attempt was already reconciled with a different outcome.",
        });
      return;
    }
    if (
      !["DISPATCHING", "AMBIGUOUS", "RECONCILIATION_REQUIRED"].includes(
        ledger.dispatchState
      )
    )
      throw new AppError({
        code: "CONFLICT",
        message: "Only an uncertain send can be reconciled here.",
      });
    await tx.backgroundJob.updateMany({
      where: {
        relatedRequestId: request.id,
        type: "SEND_REQUEST",
        status: { in: ["PENDING", "RETRYABLE", "RUNNING"] },
        payloadJson: {
          path: ["snapshotId"],
          equals: ledger.snapshotId ?? Prisma.JsonNull,
        },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        leaseToken: null,
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
      },
    });
    await tx.outboundEmail.update({
      where: { id: ledger.id },
      data: {
        dispatchState: accepted ? "ACCEPTED" : "CANCELLED",
        status: accepted ? "SENT" : "FAILED",
        reconciledAt: new Date(),
        reconciledById: actor.userId,
        dispatchToken: null,
        ...(input.providerMessageId
          ? { providerMessageId: input.providerMessageId }
          : {}),
        ...(accepted
          ? { sentAt: ledger.sentAt ?? ledger.dispatchStartedAt ?? new Date() }
          : { failedAt: new Date() }),
        lastError: accepted
          ? null
          : "The account holder confirmed that the provider did not accept this message.",
      },
    });
    if (accepted && !request.sentAt && request.approvedAt && ledger.snapshotId)
      await tx.removalRequest.update({
        where: { id: request.id },
        data: {
          sentAt: ledger.sentAt ?? ledger.dispatchStartedAt ?? new Date(),
          ...(await calculateResponseTargetInTx(tx, {
            requestId: request.id,
            snapshotId: ledger.snapshotId,
            dispatchedAt: ledger.sentAt ?? ledger.dispatchStartedAt ?? new Date(),
            simulated: ledger.provider !== "RESEND",
            timeZone: request.user.timezone,
          })),
        },
      });
    const isCurrent =
      ledger.snapshotId !== null && ledger.snapshotId === request.currentSnapshotId;
    if (accepted && input.providerMessageId)
      await requeueUnmatchedDeliveryInTx(tx, request.userId, input.providerMessageId);
    if (isCurrent && request.status === "APPROVED")
      await applyRequestStatusInTx(tx, {
        requestId: request.id,
        from: "APPROVED",
        to: "NEEDS_USER_ACTION",
        actor: "SYSTEM",
        actorUserId: null,
        message: "The uncertain delivery attempt was reconciled by the account holder.",
      });
    if (isCurrent && ["APPROVED", "NEEDS_USER_ACTION"].includes(request.status))
      await applyRequestStatusInTx(tx, {
        requestId: request.id,
        from: "NEEDS_USER_ACTION",
        to: accepted ? "WAITING_FOR_BROKER" : "DRAFT",
        actor: "USER",
        actorUserId: actor.userId,
        message: accepted
          ? "Provider acceptance recorded after the account holder checked provider records. Acceptance does not confirm delivery."
          : "Provider non-acceptance recorded. Review and approve a new snapshot before any new send.",
      });
    await appendRequestEventInTx(tx, {
      removalRequestId: request.id,
      type: "CORRECTION",
      fromStatus: null,
      toStatus: null,
      actorType: "USER",
      actorUserId: actor.userId,
      message: accepted
        ? "The account holder confirmed provider acceptance of an uncertain attempt."
        : "The account holder confirmed that an uncertain attempt was not accepted.",
      payload: { outboundEmailId: ledger.id, outcome: input.outcome },
    });
  });
}

export async function persistVerificationAction(
  actor: ActorContext,
  input: VerificationActionCommand
) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(
      tx,
      actor,
      input.requestId,
      "request:recordOutcome"
    );
    if (
      request.status !== "BROKER_REQUESTED_VERIFICATION" ||
      !(await tx.brokerResponse.findFirst({
        where: {
          removalRequestId: request.id,
          classification: "VERIFICATION_REQUESTED",
          confirmedAt: { not: null },
          deletedAt: null,
        },
        select: { id: true },
      }))
    )
      throw new AppError({
        code: "CONFLICT",
        message:
          "This request is not waiting for a recorded broker verification request.",
      });
    await applyRequestStatusInTx(tx, {
      requestId: request.id,
      from: request.status,
      to: input.outcome === "provided" ? "WAITING_FOR_BROKER" : "REJECTED",
      actor: "USER",
      actorUserId: actor.userId,
      message:
        input.outcome === "provided"
          ? "The account holder recorded supplying verification directly to the broker. No identity document was sent by this instance."
          : "The account holder declined the broker’s verification requirement.",
    });
  });
}
