import { AppError, NotFoundError } from "@/lib/core/errors";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { dateInTimeZone, formatIsoDate } from "@/lib/format/datetime";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import type { RequestReceiptCommand } from "@/lib/requests/receipt";
import { loadRequestForDecision } from "./requestDecision";
import { calculateResponseTargetInTx } from "./responseTargets";
import { appendRequestEventInTx } from "./requests";

async function originalSubmission(
  tx: PrismaTransaction,
  request: {
    id: string;
    userId: string;
    deadlineSnapshotId: string | null;
    deadlineTimezone: string | null;
  },
  timeZone: string
) {
  const snapshotId = request.deadlineSnapshotId;
  const manual = await tx.manualSubmission.findFirst({
    where: { removalRequestId: request.id, ...(snapshotId ? { snapshotId } : {}) },
    orderBy: [{ submittedOn: "asc" }, { id: "asc" }],
    select: { snapshotId: true, submittedOn: true },
  });
  const email = await tx.outboundEmail.findFirst({
    where: {
      removalRequestId: request.id,
      userId: request.userId,
      provider: "RESEND",
      dispatchState: "ACCEPTED",
      sentAt: { not: null },
      snapshotId: snapshotId ? snapshotId : { not: null },
    },
    orderBy: [{ sentAt: "asc" }, { id: "asc" }],
    select: { snapshotId: true, sentAt: true },
  });
  if (manual && (!email?.sentAt || manual.submittedOn <= email.sentAt))
    return {
      snapshotId: manual.snapshotId,
      submittedOn: formatIsoDate(manual.submittedOn),
    };
  if (email?.snapshotId && email.sentAt)
    return {
      snapshotId: email.snapshotId,
      submittedOn: dateInTimeZone(email.sentAt, request.deadlineTimezone ?? timeZone),
    };
  return null;
}

/** A receipt correction is available only for an actual initial submission owned by this account. */
export async function getRequestReceiptContext(actor: ActorContext, requestId: string) {
  requirePermission(actor, "request:recordOutcome", { ownerUserId: actor.userId });
  return prisma.$transaction(async (tx) => {
    const request = await tx.removalRequest.findFirst({
      where: {
        id: requestId,
        userId: actor.userId,
        deletedAt: null,
        user: { status: "ACTIVE", deletionRequestedAt: null },
      },
      select: {
        id: true,
        userId: true,
        deadlineSnapshotId: true,
        deadlineTimezone: true,
        user: { select: { timezone: true } },
      },
    });
    if (!request) throw new NotFoundError();
    return originalSubmission(tx, request, request.user.timezone);
  });
}

export async function persistRequestReceipt(
  actor: ActorContext,
  input: RequestReceiptCommand
) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(
      tx,
      actor,
      input.requestId,
      "request:recordOutcome"
    );
    if (
      input.previousBasis !== request.deadlineBasis ||
      input.previousAnchorOn !==
        (request.deadlineAnchorOn ? formatIsoDate(request.deadlineAnchorOn) : null)
    )
      throw new AppError({
        code: "CONFLICT",
        message:
          "The response clock changed. Refresh the request before recording its receipt date.",
      });
    const source = await originalSubmission(tx, request, request.user.timezone);
    if (!source)
      throw new AppError({
        code: "CONFLICT",
        message:
          "Record an actual submission first. A simulated or sandbox email is not a broker receipt.",
      });
    const today = dateInTimeZone(new Date(), request.user.timezone);
    if (input.receivedOn < source.submittedOn || input.receivedOn > today)
      throw new AppError({
        code: "VALIDATION_FAILED",
        message: "Receipt must be between original submission and today.",
        details: {
          fieldErrors: {
            receivedOn: `Choose a date from ${source.submittedOn} to ${today}.`,
          },
        },
      });
    const clock = await calculateResponseTargetInTx(tx, {
      requestId: request.id,
      snapshotId: source.snapshotId,
      receiptOn: input.receivedOn,
      timeZone: request.user.timezone,
    });
    await tx.removalRequest.update({ where: { id: request.id }, data: clock });
    await appendRequestEventInTx(tx, {
      removalRequestId: request.id,
      type: "CORRECTION",
      fromStatus: request.status,
      toStatus: request.status,
      actorType: "USER",
      actorUserId: actor.userId,
      message:
        "The account holder recorded the original request’s receipt date. The approved message was preserved.",
      payload: {
        snapshotId: source.snapshotId,
        receivedOn: input.receivedOn,
        previousAnchorOn: input.previousAnchorOn,
        previousBasis: input.previousBasis,
      },
    });
  });
}
