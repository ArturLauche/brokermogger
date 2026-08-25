/**
 * Apply a stored email provider webhook to the outbound ledger and, when the
 * message was a broker request, to the removal request status.
 *
 * Idempotent: a processed event is left untouched. Unknown event types are
 * marked processed without changing request status.
 */
import { recordAudit } from "@/lib/audit/service";
import {
  findOutboundEmailByProviderMessageId,
  getWebhookEventById,
  markWebhookEventProcessed,
  updateOutboundEmail,
} from "@/lib/db/repositories/outboundEmail";
import { createLogger } from "@/lib/observability/logger";
import { systemActor } from "@/lib/permissions/actor";
import { applyDeliveryOutcome } from "@/lib/requests/lifecycle";

import { classifyEmailWebhook, providerMessageIdFromPayload } from "./datetime";
import type { JobResult } from "./types";

const log = createLogger("jobs.email-webhook");

export async function processStoredEmailWebhook(
  webhookEventId: string
): Promise<JobResult> {
  const event = await getWebhookEventById(webhookEventId);
  if (!event) {
    return { message: "Webhook event not found." };
  }
  if (event.processedAt) {
    return { message: "Webhook event already processed." };
  }

  const payload =
    event.payloadJson && typeof event.payloadJson === "object"
      ? (event.payloadJson as Record<string, unknown>)
      : {};
  const outcome = classifyEmailWebhook(event.eventType);
  const providerMessageId = providerMessageIdFromPayload(payload);
  const ledger = providerMessageId
    ? await findOutboundEmailByProviderMessageId(providerMessageId)
    : null;

  if (!ledger) {
    await markWebhookEventProcessed(event.id, {
      processingError: providerMessageId ? "ledger_not_found" : "missing_provider_id",
    });
    return {
      message: `Recorded ${event.eventType} without a matching outbound email.`,
      metadata: { outcome, matched: false },
    };
  }

  const now = new Date();
  if (outcome === "delivered") {
    await updateOutboundEmail(ledger.id, {
      status: "DELIVERED",
      metadata: { webhookEventType: event.eventType },
    });
  } else if (outcome === "bounced") {
    await updateOutboundEmail(ledger.id, {
      status: "BOUNCED",
      failedAt: now,
      lastError: "Provider reported a bounce.",
      metadata: { webhookEventType: event.eventType },
    });
  } else if (outcome === "complained") {
    await updateOutboundEmail(ledger.id, {
      status: "COMPLAINED",
      metadata: { webhookEventType: event.eventType },
    });
  }

  if (ledger.removalRequestId && (outcome === "delivered" || outcome === "bounced")) {
    const actor = systemActor(`webhook:${event.id}`);
    await applyDeliveryOutcome(actor, ledger.removalRequestId, outcome);
  }

  if (outcome === "bounced" || outcome === "complained") {
    const actor = systemActor(`webhook:${event.id}`);
    await recordAudit({
      actor,
      action: outcome === "bounced" ? "system.email_bounced" : "system.email_complaint",
      resourceType: "removal_request",
      resourceId: ledger.removalRequestId,
      metadata: { webhookEventType: event.eventType },
    });
  }

  await markWebhookEventProcessed(event.id, { outboundEmailId: ledger.id });
  log.info({ eventType: event.eventType, outcome }, "Processed email webhook");
  return {
    message: `Processed ${event.eventType}.`,
    metadata: { outcome, matched: true },
  };
}
