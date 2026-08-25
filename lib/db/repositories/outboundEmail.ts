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
      replyTo: input.replyTo,
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
  /** Raw provider payload, stored verbatim for the worker and for audits. */
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
    const created = await prisma.emailWebhookEvent.create({
      data: {
        provider: input.provider,
        eventId: input.eventId,
        eventType: input.eventType,
        payloadJson: input.payloadJson as Prisma.InputJsonObject,
        signatureVerified: input.signatureVerified,
      },
      select: { id: true, processedAt: true },
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

export async function getWebhookEventById(id: string) {
  return prisma.emailWebhookEvent.findUnique({ where: { id } });
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
