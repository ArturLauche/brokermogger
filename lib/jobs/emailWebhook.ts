/**
 * Apply a stored email provider webhook to the outbound ledger and, when the
 * message was a broker request, to the removal request status.
 *
 * Idempotent: a processed event is left untouched. Unknown event types are
 * marked processed without changing request status.
 */
import {
  getWebhookEventById,
  recordWebhookEvent,
  discardWebhookEvent,
  type WebhookEventInsert,
  type WebhookEventResult,
} from "@/lib/db/repositories/outboundEmail";
import { applyStoredDeliveryEvent } from "@/lib/db/repositories/deliveryEvents";
import { commitReceivedEmail } from "@/lib/db/repositories/receiving";
import { receivingOwner } from "@/lib/db/repositories/inboundMailboxes";
import {
  receivedWebhookSchema,
  retrieveReceivedEmail,
  type RetrievedCorrespondence,
} from "@/lib/email/receiving";
import { enqueueJob } from "@/lib/jobs/queue";
import type { ClaimedJob, JobResult } from "./types";

/**
 * Enqueue processing for a stored provider event. Duplicate deliveries that
 * were persisted but never queued still get a job: `enqueueJob` is idempotent
 * on `webhook:${id}`.
 */
export async function enqueueUnprocessedEmailWebhook(stored: {
  id: string;
  processedAt: Date | null;
}): Promise<{ enqueued: boolean }> {
  if (stored.processedAt !== null) {
    return { enqueued: false };
  }
  await enqueueJob({
    type: "PROCESS_EMAIL_WEBHOOK",
    payload: { webhookEventId: stored.id },
    idempotencyKey: `webhook:${stored.id}`,
    maxAttempts: 12,
  });
  return { enqueued: true };
}

export async function storeAndQueueEmailWebhook(
  input: WebhookEventInsert
): Promise<WebhookEventResult> {
  const stored = await recordWebhookEvent(input);
  await enqueueUnprocessedEmailWebhook(stored);
  return stored;
}

export async function processStoredEmailWebhook(
  webhookEventId: string,
  job: ClaimedJob<"PROCESS_EMAIL_WEBHOOK">
): Promise<JobResult> {
  const event = await getWebhookEventById(webhookEventId);
  if (!event || event.processedAt)
    return { message: "Webhook event already processed or erased." };
  if (event.eventType !== "email.received")
    return applyStoredDeliveryEvent(webhookEventId, job);
  const parsed = receivedWebhookSchema.safeParse(event.payloadJson);
  if (
    !event.signatureVerified ||
    !parsed.success ||
    !event.ownerUserId ||
    (await receivingOwner(parsed.data.data.to)) !== event.ownerUserId
  ) {
    await discardWebhookEvent(webhookEventId, job, "invalid_or_inactive_recipient");
    return {
      message: "Received email without an active private account recipient discarded.",
    };
  }
  let mail: RetrievedCorrespondence;
  try {
    mail = await retrieveReceivedEmail(parsed.data.data.email_id);
  } catch (error) {
    if (job.attemptCount < job.maxAttempts) throw error;
    // Make a lasting retrieval failure visible to the owner with a manual import path.
    mail = { available: false, reason: "retrieval_failed" };
  }
  return commitReceivedEmail(webhookEventId, mail, job);
}
