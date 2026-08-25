/**
 * Resend delivery webhook.
 *
 * This endpoint authenticates the provider, stores the event, and enqueues
 * processing. Duplicate deliveries that are still unprocessed are enqueued
 * again; `enqueueJob` is idempotent on `webhook:${id}`. Domain side effects
 * (ledger, request status) stay in the worker.
 */
import { Webhook } from "svix";
import { z } from "zod";

import { anonymousAuditActor, recordSecurityEvent } from "@/lib/audit/service";
import { readRequestContext } from "@/lib/auth/requestContext";
import { env } from "@/lib/config/env";
import { storeAndQueueEmailWebhook } from "@/lib/jobs/emailWebhook";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("webhook.resend");

export const dynamic = "force-dynamic";

/** Minimal shape we rely on. Everything else is kept as the raw payload. */
const payloadSchema = z.object({
  type: z.string().min(1).max(120),
  created_at: z.string().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!env.RESEND_WEBHOOK_SECRET) {
    log.warn(
      "A Resend webhook arrived but RESEND_WEBHOOK_SECRET is not configured. Delivery events are ignored."
    );
    return jsonResponse({ error: "webhook_not_configured" }, 503);
  }

  const rawBody = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    await reportSuspicious("missing_signature_headers");
    return jsonResponse({ error: "missing_signature" }, 400);
  }

  try {
    new Webhook(env.RESEND_WEBHOOK_SECRET).verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    await reportSuspicious("signature_verification_failed");
    return jsonResponse({ error: "invalid_signature" }, 400);
  }

  const raw = safeJsonParse(rawBody);
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    await reportSuspicious("payload_schema_rejected");
    return jsonResponse({ error: "invalid_payload" }, 400);
  }

  const stored = await storeAndQueueEmailWebhook({
    provider: "resend",
    eventId: `resend:${svixId}`,
    eventType: parsed.data.type,
    // Stored verbatim: the worker decides what it needs, and an audit of a
    // delivery dispute must show exactly what the provider sent.
    payloadJson: raw as Record<string, unknown>,
    signatureVerified: true,
  });

  log.info(
    { eventType: parsed.data.type, duplicate: stored.duplicate },
    "Stored an email webhook event for the worker"
  );

  // 202: accepted for later processing, deliberately not processed here.
  return jsonResponse({ received: true, duplicate: stored.duplicate }, 202);
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function reportSuspicious(reason: string): Promise<void> {
  const context = await readRequestContext();

  log.warn({ reason }, "Rejected an email webhook");

  await recordSecurityEvent({
    actor: anonymousAuditActor(context.requestId, {
      ipHash: context.ipHash,
      userAgentHash: context.userAgentHash,
    }),
    action: "security.suspicious_input_detected",
    resourceType: "instance",
    reason: "An email webhook could not be authenticated.",
    metadata: { provider: "resend", rejectionReason: reason },
  });
}
