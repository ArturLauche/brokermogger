import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/client";
import {
  receivedWebhookSchema,
  requestReferences,
  type RetrievedCorrespondence,
} from "@/lib/email/receiving";
import type { JobLease } from "@/lib/jobs/types";
import { encryptResponseContent } from "@/lib/responses/content";
import { suggestClassification } from "@/lib/responses/classify";
import { receivingOwner } from "./inboundMailboxes";
import { lockJobLeaseInTx } from "./jobLease";
import { notifyResponseInTx } from "./responses";
import { appendRequestEventInTx } from "./requests";
import { getWebhookPayload } from "./outboundEmail";

export async function commitReceivedEmail(
  webhookId: string,
  mail: RetrievedCorrespondence,
  job: JobLease
) {
  return prisma.$transaction(async (tx) => {
    const ref = await tx.emailWebhookEvent.findUnique({ where: { id: webhookId } });
    if (!ref || ref.processedAt)
      return { message: "Received email already processed or erased." };
    if (!ref.ownerUserId) return { message: "The message has no account recipient." };
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ref.ownerUserId} FOR UPDATE`;
    const owner = await tx.user.findFirst({
      where: { id: ref.ownerUserId, status: "ACTIVE", deletionRequestedAt: null },
      select: { id: true },
    });
    if (!owner) return { message: "The receiving account is no longer active." };
    // Re-read after the account lock: erasure may have removed the original event.
    const event = await tx.emailWebhookEvent.findUnique({ where: { id: webhookId } });
    if (!event || event.processedAt)
      return { message: "Received email already processed or erased." };
    const source = receivedWebhookSchema.parse(getWebhookPayload(event));
    const recipients = mail.available ? mail.to : source.data.to;
    const recipientOwner = await receivingOwner(recipients, tx);
    if (recipientOwner !== owner.id) {
      if (
        await lockJobLeaseInTx(tx, job, "PROCESS_EMAIL_WEBHOOK", {
          webhookEventId: webhookId,
        })
      )
        await tx.emailWebhookEvent.update({
          where: { id: webhookId },
          data: {
            payloadEnc: null,
            payloadJson: {},
            processedAt: new Date(),
            processingError: "recipient_mismatch",
          },
        });
      return { message: "Message recipients did not match the private account address." };
    }
    const references = mail.available
      ? requestReferences(`${mail.subject}\n${mail.body}`)
      : [];
    const matches = references.length
      ? await tx.removalRequest.findMany({
          where: { userId: owner.id, externalReference: { in: references } },
          select: {
            id: true,
            profileId: true,
            brokerId: true,
            status: true,
            deletedAt: true,
          },
          take: 2,
        })
      : [];
    const request = matches.length === 1 ? matches[0]! : null;
    if (request)
      await tx.$executeRaw`SELECT 1 FROM "RemovalRequest" WHERE id = ${request.id} FOR UPDATE`;
    if (
      !(await lockJobLeaseInTx(tx, job, "PROCESS_EMAIL_WEBHOOK", {
        webhookEventId: webhookId,
      }))
    )
      return { message: "The receiving worker no longer holds its lease." };
    if (request?.deletedAt) {
      await tx.emailWebhookEvent.update({
        where: { id: webhookId },
        data: {
          payloadEnc: null,
          payloadJson: {},
          processedAt: new Date(),
          processingError: "request_erased",
        },
      });
      return { message: "Reply to an erased request was discarded." };
    }
    const providerEventId = `resend-received:${source.data.email_id}`;
    const existing = await tx.brokerResponse.findUnique({
      where: { providerEventId },
      select: { id: true, deletedAt: true, userId: true },
    });
    const id = existing?.id ?? randomUUID();
    if (!existing) {
      const content = mail.available
        ? mail
        : {
            fromAddress: source.data.from,
            subject: source.data.subject,
            body: "",
            metadata: {
              providerMailId: source.data.email_id,
              unavailableReason: mail.reason,
            },
          };
      const suggestion = suggestClassification(`${content.subject}\n${content.body}`);
      await tx.brokerResponse.create({
        data: {
          id,
          userId: owner.id,
          removalRequestId: request?.id ?? null,
          brokerId: request?.brokerId ?? null,
          receivedAt: mail.available
            ? mail.receivedAt
            : new Date(source.data.created_at ?? source.created_at),
          channel: "EMAIL",
          ...encryptResponseContent(id, content),
          suggestedClassification: suggestion,
          classification: "UNCLEAR",
          classificationConfidence: "LOW",
          requiresUserAction: true,
          providerEventId,
        },
      });
      if (request)
        await appendRequestEventInTx(tx, {
          removalRequestId: request.id,
          type: "RESPONSE_RECEIVED",
          fromStatus: request.status,
          toStatus: request.status,
          actorType: "SYSTEM",
          actorUserId: null,
          message:
            "A reply reached the private account address and matched this request's full reference. The account holder must review its content and outcome.",
          payload: { responseId: id },
        });
      await notifyResponseInTx(tx, {
        id,
        userId: owner.id,
        removalRequestId: request?.id ?? null,
        profileId: request?.profileId ?? null,
      });
    }
    // Store the response link only for the same owner. An inconsistent provider ID cannot cross accounts.
    await tx.emailWebhookEvent.update({
      where: { id: webhookId },
      data: {
        processedAt: new Date(),
        brokerResponseId: !existing || existing.userId === owner.id ? id : null,
        processingError: existing ? "duplicate_received_message" : null,
        ...(existing ? { payloadEnc: null, payloadJson: {} } : {}),
      },
    });
    return {
      message: existing
        ? "Duplicate received email ignored."
        : request
          ? "Reply recorded for owner review."
          : "Unmatched correspondence saved to the owner's inbox.",
    };
  });
}
