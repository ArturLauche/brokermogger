/**
 * Persistence for the outbound email ledger and for raw provider webhook
 * events.
 *
 * Recipient and subject arrive already encrypted from `lib/email/ledger.ts`,
 * which owns the crypto context. The body is never stored, only its hash. The
 * unique constraint `(removalRequestId, purpose, attempt)` is the send dedupe
 * key: a second attempt with the same tuple is a conflict, not a new row.
 */
import {
  type EmailProviderKind,
  type EmailPurpose,
  type EmailStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { receivedWebhookSchema } from "@/lib/email/receiving";
import { minimalDeliveryPayload } from "@/lib/email/delivery";
import { receivingOwner } from "./inboundMailboxes";
import { lockJobLeaseInTx } from "./jobLease";
import type { JobLease } from "@/lib/jobs/types";
import { randomUUID } from "node:crypto";
import { decryptField, encryptField } from "@/lib/security/crypto";

export interface OutboundEmailInsert {
  id: string;
  purpose: EmailPurpose;
  provider: EmailProviderKind;
  status: EmailStatus;
  removalRequestId: string | null;
  userId: string | null;
  profileId: string | null;
  toAddressEnc: string;
  toAddressMasked: string;
  toAddressHash: string;
  fromAddress: string;
  replyTo: string | null;
  subjectEnc: string;
  bodyHash: string;
  attempt: number;
  metadata: Record<string, unknown>;
}

export interface OutboundEmailPatch {
  status?: EmailStatus;
  providerMessageId?: string | null;
  sentAt?: Date | null;
  failedAt?: Date | null;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
}

export async function insertOutboundEmail(input: OutboundEmailInsert): Promise<string> {
  const created = await prisma.outboundEmail.create({
    data: {
      id: input.id,
      purpose: input.purpose,
      provider: input.provider,
      status: input.status,
      removalRequestId: input.removalRequestId,
      userId: input.userId,
      profileId: input.profileId,
      toAddressEnc: input.toAddressEnc,
      toAddressMasked: input.toAddressMasked,
      toAddressHash: input.toAddressHash,
      fromAddress: input.fromAddress,
      replyTo: null,
      replyToEnc: input.replyTo
        ? encryptField(input.replyTo, {
            table: "OutboundEmail",
            column: "replyToEnc",
            recordId: input.id,
          })
        : null,
      subjectEnc: input.subjectEnc,
      bodyHash: input.bodyHash,
      attempt: input.attempt,
      metadata: input.metadata as Prisma.InputJsonObject,
    },
    select: { id: true },
  });

  return created.id;
}

export async function updateOutboundEmail(
  id: string,
  patch: OutboundEmailPatch
): Promise<void> {
  await prisma.outboundEmail.update({
    where: { id },
    data: {
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.providerMessageId === undefined
        ? {}
        : { providerMessageId: patch.providerMessageId }),
      ...(patch.sentAt === undefined ? {} : { sentAt: patch.sentAt }),
      ...(patch.failedAt === undefined ? {} : { failedAt: patch.failedAt }),
      ...(patch.lastError === undefined ? {} : { lastError: patch.lastError }),
      ...(patch.metadata === undefined
        ? {}
        : { metadata: patch.metadata as Prisma.InputJsonObject }),
    },
  });
}

export interface OutboundEmailSummary {
  id: string;
  status: EmailStatus;
  attempt: number;
  sentAt: Date | null;
  providerMessageId: string | null;
  toAddressMasked: string;
}

/** Looks up the dedupe tuple of the email ledger. */
export async function findOutboundEmailAttempt(
  removalRequestId: string,
  purpose: EmailPurpose,
  attempt: number
): Promise<OutboundEmailSummary | null> {
  return prisma.outboundEmail.findUnique({
    where: {
      removalRequestId_purpose_attempt: { removalRequestId, purpose, attempt },
    },
    select: {
      id: true,
      status: true,
      attempt: true,
      sentAt: true,
      providerMessageId: true,
      toAddressMasked: true,
    },
  });
}

export interface WebhookEventInsert {
  provider: string;
  eventId: string;
  eventType: string;
  /** Validated provider payload, encrypted before persistence. */
  payloadJson: Record<string, unknown>;
  signatureVerified: boolean;
}

export interface WebhookEventResult {
  id: string;
  /** True when the provider replayed an event we already stored. */
  duplicate: boolean;
  processedAt: Date | null;
}

/**
 * Stores a webhook event for the background worker to process. Idempotent on
 * the provider event id, so a provider retry never creates a second row.
 */
export async function recordWebhookEvent(
  input: WebhookEventInsert
): Promise<WebhookEventResult> {
  const existing = await prisma.emailWebhookEvent.findUnique({
    where: { eventId: input.eventId },
    select: { id: true, processedAt: true },
  });

  if (existing) {
    return {
      id: existing.id,
      duplicate: true,
      processedAt: existing.processedAt,
    };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const id = randomUUID();
      const payloadData = input.payloadJson.data;
      const providerMessageId =
        payloadData &&
        typeof payloadData === "object" &&
        "email_id" in payloadData &&
        typeof payloadData.email_id === "string" &&
        payloadData.email_id.length <= 200
          ? payloadData.email_id
          : null;
      let ownerUserId: string | null = null;
      let processingError: string | null = null;
      let privatePayload: unknown = null;
      if (!input.signatureVerified) processingError = "signature_not_verified";
      else if (input.eventType === "email.received") {
        const received = receivedWebhookSchema.safeParse(input.payloadJson);
        privatePayload = received.success ? received.data : null;
        ownerUserId = received.success
          ? await receivingOwner(received.data.data.to, tx)
          : null;
        if (!ownerUserId) processingError = "unknown_or_ambiguous_recipient";
      } else {
        privatePayload = minimalDeliveryPayload(input.payloadJson);
        if (!privatePayload) processingError = "invalid_delivery_event";
        const data = input.payloadJson.data;
        const messageId =
          data &&
          typeof data === "object" &&
          "email_id" in data &&
          typeof data.email_id === "string"
            ? data.email_id
            : null;
        if (messageId) {
          const matches = await tx.outboundEmail.findMany({
            where: { providerMessageId: messageId, provider: "RESEND" },
            select: { userId: true },
            take: 2,
          });
          if (matches.length === 1) ownerUserId = matches[0]!.userId;
        }
      }
      if (ownerUserId) {
        await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ownerUserId} FOR UPDATE`;
        if (
          !(await tx.user.findFirst({
            where: { id: ownerUserId, status: "ACTIVE", deletionRequestedAt: null },
            select: { id: true },
          }))
        )
          processingError = "account_inactive";
      }
      return tx.emailWebhookEvent.create({
        data: {
          id,
          provider: input.provider,
          eventId: input.eventId,
          eventType: input.eventType,
          providerMessageId,
          ownerUserId,
          payloadJson: {},
          payloadEnc: processingError
            ? null
            : encryptField(JSON.stringify(privatePayload), {
                table: "EmailWebhookEvent",
                column: "payloadEnc",
                recordId: id,
              }),
          signatureVerified: input.signatureVerified,
          processedAt: processingError ? new Date() : null,
          processingError,
        },
        select: { id: true, processedAt: true },
      });
    });

    return { id: created.id, duplicate: false, processedAt: created.processedAt };
  } catch (error) {
    const again = await prisma.emailWebhookEvent.findUnique({
      where: { eventId: input.eventId },
      select: { id: true, processedAt: true },
    });
    if (again) {
      return { id: again.id, duplicate: true, processedAt: again.processedAt };
    }
    throw error;
  }
}

export function getWebhookPayload(event: {
  id: string;
  payloadEnc: string | null;
  payloadJson: Prisma.JsonValue;
}): Prisma.JsonValue {
  return event.payloadEnc
    ? (JSON.parse(
        decryptField(event.payloadEnc, {
          table: "EmailWebhookEvent",
          column: "payloadEnc",
          recordId: event.id,
        })
      ) as Prisma.JsonValue)
    : event.payloadJson;
}

export async function getWebhookEventById(id: string) {
  const event = await prisma.emailWebhookEvent.findUnique({ where: { id } });
  return event ? { ...event, payloadJson: getWebhookPayload(event) } : null;
}

export async function listUnprocessedWebhookEvents(take = 50) {
  return prisma.emailWebhookEvent.findMany({
    where: { processedAt: null },
    orderBy: { receivedAt: "asc" },
    take,
  });
}

export async function markWebhookEventProcessed(
  id: string,
  patch: { outboundEmailId?: string | null; processingError?: string | null } = {}
) {
  return prisma.emailWebhookEvent.update({
    where: { id },
    data: {
      processedAt: new Date(),
      ...(patch.outboundEmailId === undefined
        ? {}
        : { outboundEmailId: patch.outboundEmailId }),
      ...(patch.processingError === undefined
        ? {}
        : { processingError: patch.processingError }),
    },
  });
}

export async function findOutboundEmailByProviderMessageId(providerMessageId: string) {
  if (!providerMessageId) return null;
  return prisma.outboundEmail.findFirst({
    where: { providerMessageId },
    select: {
      id: true,
      status: true,
      purpose: true,
      removalRequestId: true,
      userId: true,
    },
  });
}

export async function discardWebhookEvent(id: string, job: JobLease, reason: string) {
  return prisma.$transaction(async (tx) => {
    if (
      !(await lockJobLeaseInTx(tx, job, "PROCESS_EMAIL_WEBHOOK", { webhookEventId: id }))
    )
      return;
    await tx.emailWebhookEvent.updateMany({
      where: { id, processedAt: null },
      data: {
        payloadEnc: null,
        payloadJson: {},
        processedAt: new Date(),
        processingError: reason,
      },
    });
  });
}
