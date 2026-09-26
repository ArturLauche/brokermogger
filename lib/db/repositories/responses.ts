import { createNotificationInTx } from "./notifications";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type RequestStatus } from "@prisma/client";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { AppError, NotFoundError } from "@/lib/core/errors";
import { dateInTimeZone } from "@/lib/format/datetime";
import { pageInputSchema, createdBeforeCursor, cursorPage } from "@/lib/pagination";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { encryptResponseContent, readResponseContent } from "@/lib/responses/content";
import { suggestClassification } from "@/lib/responses/classify";
import { RESPONSE_LABELS, RESPONSE_STATUS } from "@/lib/responses/labels";
import type {
  ConfirmResponseCommand,
  LinkResponseCommand,
  ManualResponseCommand,
} from "@/lib/responses/validation";
import { parseWithSchema } from "@/lib/validation/form";
import { loadRequestForDecision } from "./requestDecision";
import { lockActiveAccount } from "./access";
import { appendRequestEventInTx, applyRequestStatusInTx } from "./requests";

async function ownedResponseInTx(
  tx: PrismaTransaction,
  actor: ActorContext,
  id: string,
  action: "response:confirm" | "response:delete"
) {
  const ref = await tx.brokerResponse.findFirst({
    where: { id, deletedAt: null },
    select: { userId: true },
  });
  if (!ref) throw new NotFoundError("This response does not exist.");
  requirePermission(actor, action, { ownerUserId: ref.userId });
  await lockActiveAccount(tx, ref.userId);
  const response = await tx.brokerResponse.findFirst({
    where: { id, userId: ref.userId, deletedAt: null },
  });
  if (!response) throw new NotFoundError("This response does not exist.");
  return response;
}

export async function notifyResponseInTx(
  tx: PrismaTransaction,
  input: {
    id: string;
    userId: string;
    removalRequestId: string | null;
    profileId: string | null;
  }
) {
  const dedupeKey = `broker-response:${input.id}`;
  await createNotificationInTx(tx, {
    userId: input.userId,
    profileId: input.profileId,
    removalRequestId: input.removalRequestId,
    type: "BROKER_RESPONSE_RECEIVED",
    title: "Correspondence to review",
    body: input.removalRequestId
      ? "A reply is ready for your review. Confirm its meaning before changing the request status."
      : "A message reached your private reply address. Choose its request after reviewing the message.",
    actionUrl: `/responses/${input.id}`,
    dedupeKey,
  });
}

export async function recordManualResponse(
  actor: ActorContext,
  input: ManualResponseCommand
) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(
      tx,
      actor,
      input.requestId,
      "request:recordOutcome"
    );
    requirePermission(actor, "response:record", { ownerUserId: request.userId });
    if (input.receivedOn > dateInTimeZone(new Date(), request.user.timezone))
      throw new AppError({
        code: "VALIDATION_FAILED",
        message: "The received date cannot be in the future.",
        details: {
          fieldErrors: {
            receivedOn: "Choose today or an earlier date in your account timezone.",
          },
        },
      });
    const submissionKey = `${request.userId}:${input.submissionKey}`;
    const existing = await tx.brokerResponse.findUnique({ where: { submissionKey } });
    if (existing) {
      const content = readResponseContent(existing);
      if (
        existing.removalRequestId !== request.id ||
        existing.receivedOn?.toISOString().slice(0, 10) !== input.receivedOn ||
        content.subject !== input.subject ||
        content.body !== input.body ||
        content.fromAddress !== input.fromAddress ||
        existing.evidenceFileId !== input.evidenceFileId ||
        existing.channel !== input.channel
      )
        throw new AppError({
          code: "CONFLICT",
          message:
            "This form was already saved with different content. Open a new response form.",
        });
      return { id: existing.id, alreadyRecorded: true };
    }
    if (
      input.evidenceFileId &&
      !(await tx.evidenceFile.findFirst({
        where: {
          id: input.evidenceFileId,
          userId: request.userId,
          removalRequestId: request.id,
          storageState: "READY",
          deletedAt: null,
          kind: { not: "IDENTITY_DOCUMENT" },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      }))
    )
      throw new AppError({
        code: "FORBIDDEN",
        message: "Choose an available evidence file for this request.",
      });
    const id = randomUUID();
    const suggestion = suggestClassification(`${input.subject}\n${input.body}`);
    await tx.brokerResponse.create({
      data: {
        id,
        userId: request.userId,
        removalRequestId: request.id,
        brokerId: request.brokerId,
        receivedAt: new Date(),
        receivedOn: new Date(`${input.receivedOn}T00:00:00Z`),
        channel: input.channel,
        ...encryptResponseContent(id, input),
        suggestedClassification: suggestion,
        classification: "UNCLEAR",
        classificationConfidence: "LOW",
        classifiedBy: "USER",
        requiresUserAction: true,
        evidenceFileId: input.evidenceFileId,
        createdById: actor.userId,
        submissionKey,
      },
    });
    await appendRequestEventInTx(tx, {
      removalRequestId: request.id,
      type: "RESPONSE_RECEIVED",
      fromStatus: request.status,
      toStatus: request.status,
      actorType: "USER",
      actorUserId: actor.userId,
      message:
        "A broker response was recorded. Its meaning and any status change await account-holder confirmation.",
      payload: { responseId: id },
    });
    await notifyResponseInTx(tx, {
      id,
      userId: request.userId,
      removalRequestId: request.id,
      profileId: request.profileId,
    });
    return { id, alreadyRecorded: false };
  });
}

export async function getOwnedResponse(actor: ActorContext, id: string) {
  const row = await prisma.brokerResponse.findFirst({
    where: { id, deletedAt: null, user: { status: "ACTIVE", deletionRequestedAt: null } },
    include: {
      removalRequest: {
        select: {
          id: true,
          status: true,
          externalReference: true,
          sentAt: true,
          deletedAt: true,
        },
      },
      broker: { select: { legalName: true } },
    },
  });
  if (!row) throw new NotFoundError("This response does not exist.");
  requirePermission(actor, "response:read", { ownerUserId: row.userId });
  const evidence = row.evidenceFileId
    ? await prisma.evidenceFile.findFirst({
        where: {
          id: row.evidenceFileId,
          userId: row.userId,
          storageState: "READY",
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      })
    : null;
  return {
    id: row.id,
    removalRequestId: row.removalRequestId,
    receivedAt: row.receivedAt,
    receivedOn: row.receivedOn,
    confirmedAt: row.confirmedAt,
    classification: row.classification,
    classificationRevision: row.classificationRevision,
    suggestedClassification: row.suggestedClassification,
    removalRequest: row.removalRequest,
    broker: row.broker,
    evidenceFileId: evidence?.id ?? null,
    content: readResponseContent(row),
  };
}

export async function listOwnedResponses(
  actor: ActorContext,
  input: {
    cursor?: string | undefined;
    limit?: number;
    filter?: "all" | "unmatched" | "review" | undefined;
  } = {}
) {
  requirePermission(actor, "response:read", { ownerUserId: actor.userId });
  const page = parseWithSchema(pageInputSchema, input);
  const rows = await prisma.brokerResponse.findMany({
    where: {
      userId: actor.userId,
      deletedAt: null,
      user: { status: "ACTIVE", deletionRequestedAt: null },
      ...(input.filter === "unmatched"
        ? { removalRequestId: null }
        : input.filter === "review"
          ? { confirmedAt: null }
          : {}),
      ...createdBeforeCursor(page.cursor),
    },
    select: {
      id: true,
      createdAt: true,
      receivedAt: true,
      receivedOn: true,
      classification: true,
      confirmedAt: true,
      removalRequestId: true,
      broker: { select: { legalName: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: page.limit + 1,
  });
  return cursorPage(rows, page.limit);
}

export async function searchResponseRequestChoices(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "request:read", { ownerUserId: actor.userId });
  const input = parseWithSchema(
    pageInputSchema.extend({ q: z.string().trim().max(160).default("") }),
    raw
  );
  const rows = await prisma.removalRequest.findMany({
    where: {
      userId: actor.userId,
      deletedAt: null,
      AND: [
        createdBeforeCursor(input.cursor),
        ...(input.q
          ? [
              {
                OR: [
                  {
                    externalReference: {
                      contains: input.q,
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    broker: {
                      legalName: { contains: input.q, mode: "insensitive" as const },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      createdAt: true,
      externalReference: true,
      status: true,
      profile: { select: { displayName: true } },
      broker: { select: { legalName: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
  return cursorPage(rows, input.limit);
}

export async function confirmOwnedResponse(
  actor: ActorContext,
  input: ConfirmResponseCommand
) {
  return prisma.$transaction(async (tx) => {
    const response = await ownedResponseInTx(
      tx,
      actor,
      input.responseId,
      "response:confirm"
    );
    const target = input.applyToRequest ? RESPONSE_STATUS[input.classification] : null;
    if (input.applyToRequest && !target)
      throw new AppError({
        code: "VALIDATION_FAILED",
        message:
          "This classification does not change request status. Choose to record the classification only.",
      });
    if (response.classificationRevision !== input.expectedRevision) {
      if (
        response.classificationRevision === input.expectedRevision + 1 &&
        response.classification === input.classification &&
        response.appliedStatus === (target ?? null)
      )
        return;
      throw new AppError({
        code: "CONFLICT",
        message:
          "This reply has been reviewed since you opened it. Reload before confirming.",
      });
    }
    let request = null;
    if (response.removalRequestId)
      request = await loadRequestForDecision(
        tx,
        actor,
        response.removalRequestId,
        "request:recordOutcome"
      );
    if (target) {
      const evidence = response.evidenceFileId
        ? await tx.evidenceFile.findFirst({
            where: {
              id: response.evidenceFileId,
              userId: response.userId,
              deletedAt: null,
              storageState: "READY",
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            select: { id: true },
          })
        : null;
      const content = readResponseContent(response);
      if ((!content.body || content.previewOnly) && !evidence)
        throw new AppError({
          code: "CONFLICT",
          message:
            "Record the full reply text or available evidence before applying its outcome. A legacy preview alone is insufficient.",
        });
      if (!request?.sentAt)
        throw new AppError({
          code: "CONFLICT",
          message:
            "Record submission or resolve uncertain delivery before applying a broker outcome.",
        });
      if (request.status !== input.expectedRequestStatus)
        throw new AppError({
          code: "CONFLICT",
          message: "The request status changed. Reload and review the proposed outcome.",
        });
      if (request.status === "CLOSED")
        throw new AppError({
          code: "CONFLICT",
          message:
            "A closed request keeps its status. Record the classification without changing the request.",
        });
      if (target !== request.status)
        await applyRequestStatusInTx(tx, {
          requestId: request.id,
          from: request.status,
          to: target,
          actor: "USER",
          actorUserId: actor.userId,
          message: `The account holder reviewed a broker reply: ${RESPONSE_LABELS[input.classification].toLowerCase()}.`,
          cancelPendingJobTypes: [
            "SEND_REQUEST",
            "PREPARE_FOLLOW_UP",
            "RECHECK_REMINDER",
          ],
        });
    }
    await tx.brokerResponse.update({
      where: { id: response.id },
      data: {
        classification: input.classification,
        classifiedBy: "USER",
        classificationConfidence: "HIGH",
        confirmedAt: new Date(),
        confirmedById: actor.userId,
        classificationRevision: { increment: 1 },
        appliedStatus: target ?? null,
        requiresUserAction: ["VERIFICATION_REQUESTED", "UNCLEAR", "REJECTED"].includes(
          input.classification
        ),
      },
    });
    if (request)
      await appendRequestEventInTx(tx, {
        removalRequestId: request.id,
        type: response.confirmedAt ? "CORRECTION" : "NOTE",
        fromStatus: target ?? request.status,
        toStatus: target ?? request.status,
        actorType: "USER",
        actorUserId: actor.userId,
        message: `Reply classification ${response.confirmedAt ? "corrected" : "confirmed"} by the account holder: ${RESPONSE_LABELS[input.classification].toLowerCase()}.${target ? " The request status reflects this reported outcome." : " The request status was left unchanged."}`,
        payload: {
          responseId: response.id,
          classification: input.classification,
          revision: response.classificationRevision + 1,
          appliedStatus: target ?? null,
        },
      });
    await tx.notification.updateMany({
      where: {
        userId: response.userId,
        dedupeKey: `broker-response:${response.id}`,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  });
}

export async function linkOwnedResponse(actor: ActorContext, input: LinkResponseCommand) {
  return prisma.$transaction(async (tx) => {
    const response = await ownedResponseInTx(
      tx,
      actor,
      input.responseId,
      "response:confirm"
    );
    const request = await loadRequestForDecision(
      tx,
      actor,
      input.requestId,
      "request:recordOutcome"
    );
    if (response.removalRequestId === request.id) return;
    if (
      response.removalRequestId ||
      response.classificationRevision !== input.expectedRevision
    )
      throw new AppError({
        code: "CONFLICT",
        message:
          "This message was already matched or reviewed. Reload before assigning it.",
      });
    await tx.brokerResponse.update({
      where: { id: response.id },
      data: {
        removalRequestId: request.id,
        brokerId: request.brokerId,
        classificationRevision: { increment: 1 },
      },
    });
    await appendRequestEventInTx(tx, {
      removalRequestId: request.id,
      type: "RESPONSE_RECEIVED",
      fromStatus: request.status,
      toStatus: request.status,
      actorType: "USER",
      actorUserId: actor.userId,
      message:
        "The account holder assigned an unmatched reply to this request. Its classification does not change the request automatically.",
      payload: { responseId: response.id },
    });
  });
}

export async function deleteOwnedResponse(actor: ActorContext, id: string) {
  return prisma.$transaction(async (tx) => {
    const response = await ownedResponseInTx(tx, actor, id, "response:delete");
    // Retain an opaque dedupe tombstone so provider retries do not restore erased content.
    await tx.brokerResponse.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        fromAddress: null,
        fromAddressEnc: null,
        subjectEnc: null,
        bodyEnc: null,
        bodyPreview: null,
        metadataEnc: null,
        rawMetadata: {},
        evidenceFileId: null,
      },
    });
    await tx.notification.deleteMany({
      where: { userId: response.userId, dedupeKey: `broker-response:${id}` },
    });
    await tx.emailWebhookEvent.updateMany({
      where: { brokerResponseId: id },
      data: {
        payloadEnc: null,
        payloadJson: {},
        processedAt: new Date(),
        processingError: "response_erased",
      },
    });
  });
}

/** Used by explicit out-of-band completion only; a draft cannot be called submitted. */
export async function confirmRequestCompletion(actor: ActorContext, id: string) {
  await prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(tx, actor, id, "request:recordOutcome");
    if (!request.sentAt)
      throw new AppError({
        code: "CONFLICT",
        message: "Record submission before confirming its outcome.",
      });
    await applyRequestStatusInTx(tx, {
      requestId: id,
      from: request.status,
      to: "COMPLETED" satisfies RequestStatus,
      actor: "USER",
      actorUserId: actor.userId,
      message:
        "The account holder confirmed completion outside this correspondence workflow.",
      cancelPendingJobTypes: ["SEND_REQUEST", "PREPARE_FOLLOW_UP", "RECHECK_REMINDER"],
    });
  });
}
