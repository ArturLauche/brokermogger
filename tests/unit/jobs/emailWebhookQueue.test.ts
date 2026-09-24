import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  recordWebhookEvent: vi.fn(),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: mocks.enqueueJob,
}));

vi.mock("@/lib/db/repositories/outboundEmail", () => ({
  recordWebhookEvent: mocks.recordWebhookEvent,
  getWebhookEventById: vi.fn(),
  getWebhookPayload: vi.fn(),
  discardWebhookEvent: vi.fn(),
}));

const { enqueueUnprocessedEmailWebhook, storeAndQueueEmailWebhook } =
  await import("@/lib/jobs/emailWebhook");

beforeEach(() => {
  mocks.enqueueJob.mockReset();
  mocks.recordWebhookEvent.mockReset();
  mocks.enqueueJob.mockResolvedValue({ id: "job-1", created: true });
});

describe("enqueueUnprocessedEmailWebhook", () => {
  it("enqueues new and duplicate events that are still unprocessed", async () => {
    await enqueueUnprocessedEmailWebhook({ id: "evt-1", processedAt: null });
    await enqueueUnprocessedEmailWebhook({ id: "evt-1", processedAt: null });

    expect(mocks.enqueueJob).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PROCESS_EMAIL_WEBHOOK",
        payload: { webhookEventId: "evt-1" },
        idempotencyKey: "webhook:evt-1",
      })
    );
  });

  it("skips events that were already processed", async () => {
    await enqueueUnprocessedEmailWebhook({
      id: "evt-2",
      processedAt: new Date("2026-08-25T12:00:00.000Z"),
    });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it("retries enqueue after the event was stored and the first enqueue failed", async () => {
    mocks.recordWebhookEvent
      .mockResolvedValueOnce({ id: "evt-3", duplicate: false, processedAt: null })
      .mockResolvedValueOnce({ id: "evt-3", duplicate: true, processedAt: null });
    mocks.enqueueJob
      .mockRejectedValueOnce(new Error("queue unavailable"))
      .mockResolvedValueOnce({ id: "job-1", created: false });

    const input = {
      provider: "resend",
      eventId: "resend:svix-3",
      eventType: "email.delivered",
      payloadJson: {},
      signatureVerified: true,
    };

    await expect(storeAndQueueEmailWebhook(input)).rejects.toThrow("queue unavailable");
    const retry = await storeAndQueueEmailWebhook(input);

    expect(retry.duplicate).toBe(true);
    expect(retry.processedAt).toBeNull();
    expect(mocks.enqueueJob).toHaveBeenCalledTimes(2);
  });
});
