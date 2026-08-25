/**
 * Provider webhook redelivery after a failed enqueue.
 */
import { describe, expect, it } from "vitest";

import { findJobByIdempotency } from "@/lib/db/repositories/jobs";
import { recordWebhookEvent } from "@/lib/db/repositories/outboundEmail";
import { enqueueUnprocessedEmailWebhook } from "@/lib/jobs/emailWebhook";

describe("email webhook redelivery", () => {
  it("enqueues processing when the provider retries an unprocessed duplicate", async () => {
    const input = {
      provider: "resend",
      eventId: "resend:svix-redelivery-1",
      eventType: "email.delivered",
      payloadJson: { type: "email.delivered", data: { email_id: "msg_1" } },
      signatureVerified: true,
    };

    const stored = await recordWebhookEvent(input);
    expect(stored.duplicate).toBe(false);
    expect(stored.processedAt).toBeNull();

    const retried = await recordWebhookEvent(input);
    expect(retried).toEqual({
      id: stored.id,
      duplicate: true,
      processedAt: null,
    });

    const missing = await findJobByIdempotency(`webhook:${stored.id}`);
    expect(missing).toBeNull();

    const queued = await enqueueUnprocessedEmailWebhook(retried);
    expect(queued.enqueued).toBe(true);

    const job = await findJobByIdempotency(`webhook:${stored.id}`);
    expect(job?.status).toBe("PENDING");
  });
});
