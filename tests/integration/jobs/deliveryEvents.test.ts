import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  claimDueJobs,
  expireStaleLocks,
  markJobCompleted,
} from "@/lib/db/repositories/jobs";
import { getWebhookEventById } from "@/lib/db/repositories/outboundEmail";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { backfillPrivatePayloads } from "@/lib/db/repositories/privacyMigration";
import {
  countExpiredUnmatchedDelivery,
  expireUnmatchedDelivery,
} from "@/lib/db/repositories/retention";
import {
  processStoredEmailWebhook,
  storeAndQueueEmailWebhook,
} from "@/lib/jobs/emailWebhook";
import type { ClaimedJob } from "@/lib/jobs/types";
import { clearMockOutbox } from "@/lib/email/providers/mock";
import { systemActor } from "@/lib/permissions/actor";
import {
  approveRequest,
  generateRequests,
  prepareFollowUp,
  prepareFollowUpDraft,
  sendApprovedRequest,
} from "@/lib/requests/lifecycle";
import { encryptField } from "@/lib/security/crypto";
import { recordRequestReceipt } from "@/lib/requests/receipt";
import { dateInTimeZone, formatIsoDate } from "@/lib/format/datetime";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

afterEach(clearMockOutbox);

async function sent() {
  const f = await workflowFixture();
  const {
    requestIds: [id],
  } = await generateRequests(f.actor, f.input);
  const request = await getOwnedRequest(f.actor, id!);
  await approveRequest(f.actor, {
    requestId: id,
    envelopeHash: request.snapshots[0]!.envelopeHash,
    confirmationAccepted: true,
  });
  const [job] = await claimDueJobs("mock-send", 1);
  const payload = (job as ClaimedJob<"SEND_REQUEST">).payload;
  await sendApprovedRequest(
    systemActor(job!.id),
    id!,
    payload.attempt,
    payload.snapshotId,
    job!
  );
  await markJobCompleted(job!, { message: "Simulated submission." }, 1);
  const ledger = await testPrisma.outboundEmail.findFirstOrThrow({
    where: { removalRequestId: id! },
  });
  const providerMessageId = randomUUID();
  // Only the provider receipt is simulated; nothing calls the external sending API.
  await testPrisma.outboundEmail.update({
    where: { id: ledger.id },
    data: { provider: "RESEND", providerMessageId },
  });
  return {
    ...f,
    request: await getOwnedRequest(f.actor, id!),
    ledger,
    providerMessageId,
  };
}

async function receipt(providerMessageId: string, type = "email.delivered") {
  const stored = await storeAndQueueEmailWebhook({
    provider: "resend",
    eventId: `resend:${randomUUID()}`,
    eventType: type,
    signatureVerified: true,
    payloadJson: {
      type,
      created_at: new Date().toISOString(),
      data: {
        email_id: providerMessageId,
        to: ["private-recipient@example.org"],
        subject: "Private subject",
        bounce: { message: "Private diagnostic" },
      },
    },
  });
  const [job] = await claimDueJobs("delivery", 1);
  expect(job?.type).toBe("PROCESS_EMAIL_WEBHOOK");
  return { stored, job: job as ClaimedJob<"PROCESS_EMAIL_WEBHOOK"> };
}

describe("atomic provider delivery receipts", () => {
  it("refines an initial dispatch estimate once and preserves an owner-recorded receipt on replay", async () => {
    const f = await sent();
    // Simulate provider acceptance and delivery without calling a remote sending API.
    await testPrisma.removalRequest.update({
      where: { id: f.request.id },
      data: { deadlineBasis: "DISPATCH_ESTIMATE" },
    });
    const delivery = await receipt(f.providerMessageId);
    await processStoredEmailWebhook(delivery.stored.id, delivery.job);
    await markJobCompleted(delivery.job, { message: "Synthetic delivery." }, 1);
    const delivered = await getOwnedRequest(f.actor, f.request.id);
    expect(delivered.deadlineBasis).toBe("PROVIDER_DELIVERY_ESTIMATE");
    expect(delivered.deadlineIsEstimate).toBe(true);
    await recordRequestReceipt(f.actor, {
      requestId: f.request.id,
      receivedOn: dateInTimeZone(new Date(), "UTC"),
      previousAnchorOn: formatIsoDate(delivered.deadlineAnchorOn),
      previousBasis: delivered.deadlineBasis,
      confirmationAccepted: true,
    });
    const recorded = await getOwnedRequest(f.actor, f.request.id);
    const repeated = await receipt(f.providerMessageId);
    await processStoredEmailWebhook(repeated.stored.id, repeated.job);
    const current = await getOwnedRequest(f.actor, f.request.id);
    expect(current.deadlineBasis).toBe("RECORDED_RECEIPT");
    expect(current.deadlineAt).toEqual(recorded.deadlineAt);
    expect(current.deadlineSnapshotId).toBe(f.request.deadlineSnapshotId);
  });
  it("does not let an older delivery undo a bounce or a complaint", async () => {
    const f = await sent();
    const bounce = await receipt(f.providerMessageId, "email.bounced");
    await processStoredEmailWebhook(bounce.stored.id, bounce.job);
    await markJobCompleted(bounce.job, { message: "Bounce recorded." }, 1);
    const bounced = await getOwnedRequest(f.actor, f.request.id);
    expect(bounced.status).toBe("NEEDS_USER_ACTION");
    const delivery = await receipt(f.providerMessageId);
    await processStoredEmailWebhook(delivery.stored.id, delivery.job);
    await markJobCompleted(delivery.job, { message: "Old delivery recorded." }, 1);
    expect(
      await testPrisma.outboundEmail.findUniqueOrThrow({ where: { id: f.ledger.id } })
    ).toMatchObject({ status: "BOUNCED" });
    const current = await getOwnedRequest(f.actor, f.request.id);
    expect(current.status).toBe(bounced.status);
    expect(current.deliveredAt).toEqual(bounced.deliveredAt);
    const complaint = await receipt(f.providerMessageId, "email.complained");
    await processStoredEmailWebhook(complaint.stored.id, complaint.job);
    expect(
      (await testPrisma.outboundEmail.findUniqueOrThrow({ where: { id: f.ledger.id } }))
        .status
    ).toBe("COMPLAINED");
  });

  it("waits for a missing receipt without persisting unnecessary personal callback data", async () => {
    const f = await sent();
    const lateId = randomUUID();
    const { stored, job } = await receipt(lateId);
    expect(
      JSON.stringify((await getWebhookEventById(stored.id))!.payloadJson)
    ).not.toMatch(/private-recipient|Private subject|diagnostic/);
    expect(await processStoredEmailWebhook(stored.id, job)).toHaveProperty(
      "retryAfterSeconds"
    );
    expect((await getWebhookEventById(stored.id))!.processedAt).toBeNull();
    await testPrisma.outboundEmail.update({
      where: { id: f.ledger.id },
      data: { providerMessageId: lateId },
    });
    await processStoredEmailWebhook(stored.id, job);
    expect(await getWebhookEventById(stored.id)).toMatchObject({
      ownerUserId: f.user.id,
      outboundEmailId: f.ledger.id,
    });
    expect(
      (await testPrisma.outboundEmail.findUniqueOrThrow({ where: { id: f.ledger.id } }))
        .status
    ).toBe("DELIVERED");
  });

  it("preserves a newer follow-up draft when an older message bounces", async () => {
    const f = await sent();
    await prepareFollowUp(f.actor, f.request.id);
    const [followUp] = await claimDueJobs("follow-up", 1);
    await prepareFollowUpDraft(systemActor(followUp!.id), f.request.id, 1, followUp!);
    await markJobCompleted(followUp!, { message: "Follow-up draft prepared." }, 1);
    const before = await getOwnedRequest(f.actor, f.request.id);
    const { stored, job } = await receipt(f.providerMessageId, "email.bounced");
    await processStoredEmailWebhook(stored.id, job);
    const after = await getOwnedRequest(f.actor, f.request.id);
    expect(after.status).toBe(before.status);
    expect(after.currentSnapshotId).toBe(before.currentSnapshotId);
    expect(after.events.some((event) => event.message?.includes("earlier message"))).toBe(
      true
    );
  });

  it("fences a stale worker before changing the ledger or event", async () => {
    const f = await sent();
    const { stored, job } = await receipt(f.providerMessageId, "email.bounced");
    await testPrisma.backgroundJob.update({
      where: { id: job.id },
      data: { lockExpiresAt: new Date(0) },
    });
    await expireStaleLocks();
    const [current] = await claimDueJobs("replacement", 1);
    await processStoredEmailWebhook(stored.id, job);
    expect((await getWebhookEventById(stored.id))!.processedAt).toBeNull();
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(f.request.status);
    await processStoredEmailWebhook(
      stored.id,
      current as ClaimedJob<"PROCESS_EMAIL_WEBHOOK">
    );
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
      "NEEDS_USER_ACTION"
    );
  });

  it("rolls back the ledger, request and processed marker if history insertion fails", async () => {
    const f = await sent();
    const { stored, job } = await receipt(f.providerMessageId, "email.bounced");
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_receipt_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected receipt history failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_receipt_failure BEFORE INSERT ON "RemovalRequestEvent" FOR EACH ROW EXECUTE FUNCTION test_receipt_failure()`
    );
    try {
      await expect(processStoredEmailWebhook(stored.id, job)).rejects.toThrow();
      expect((await getWebhookEventById(stored.id))!.processedAt).toBeNull();
      expect(
        (await testPrisma.outboundEmail.findUniqueOrThrow({ where: { id: f.ledger.id } }))
          .status
      ).toBe(f.ledger.status);
      expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
        f.request.status
      );
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_receipt_failure ON "RemovalRequestEvent"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_receipt_failure()`);
    }
    await processStoredEmailWebhook(stored.id, job);
    const count = await testPrisma.removalRequestEvent.count();
    await processStoredEmailWebhook(stored.id, job);
    expect(await testPrisma.removalRequestEvent.count()).toBe(count);
  });

  it("minimises legacy unowned encrypted callbacks and expires stranded events", async () => {
    const id = randomUUID();
    const old = {
      created_at: new Date().toISOString(),
      data: { email_id: randomUUID(), to: ["old-private@example.org"] },
    };
    await testPrisma.emailWebhookEvent.create({
      data: {
        id,
        provider: "resend",
        eventId: `resend:${id}`,
        eventType: "email.delivered",
        signatureVerified: true,
        payloadJson: {},
        payloadEnc: encryptField(JSON.stringify(old), {
          table: "EmailWebhookEvent",
          column: "payloadEnc",
          recordId: id,
        }),
        receivedAt: new Date(Date.now() - 25 * 60 * 60_000),
      },
    });
    expect((await backfillPrivatePayloads()).webhooks).toBe(1);
    expect(JSON.stringify((await getWebhookEventById(id))!.payloadJson)).not.toContain(
      "old-private"
    );
    expect((await backfillPrivatePayloads()).webhooks).toBe(0);
    const cutoff = new Date(Date.now() - 24 * 60 * 60_000);
    expect(await countExpiredUnmatchedDelivery(cutoff)).toBe(1);
    expect(await expireUnmatchedDelivery(cutoff, 100)).toBe(1);
    expect(await getWebhookEventById(id)).toMatchObject({
      payloadEnc: null,
      processingError: "unmatched_delivery_expired",
    });
    expect((await backfillPrivatePayloads()).webhooks).toBe(0);
  });
});
