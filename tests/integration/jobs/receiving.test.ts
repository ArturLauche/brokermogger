import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCacheForTests } from "@/lib/config/env";
import {
  claimDueJobs,
  markJobCompleted,
  expireStaleLocks,
} from "@/lib/db/repositories/jobs";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { getOwnedResponse, listOwnedResponses } from "@/lib/db/repositories/responses";
import {
  markAccountDeletionRequested,
  anonymiseDeletedAccount,
} from "@/lib/db/repositories/account";
import {
  processStoredEmailWebhook,
  storeAndQueueEmailWebhook,
} from "@/lib/jobs/emailWebhook";
import { approveRequest, generateRequests } from "@/lib/requests/lifecycle";
import { readApprovalEnvelope } from "@/lib/requests/envelope";
import { confirmResponse, deleteResponse, linkResponse } from "@/lib/responses/service";
import { systemActor } from "@/lib/permissions/actor";
import type { ClaimedJob } from "@/lib/jobs/types";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

beforeEach(() => {
  vi.stubEnv("RESEND_RECEIVING_DOMAIN", "replies.example.org");
  vi.stubEnv("RESEND_API_KEY", "test-receiving-key");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "test-webhook-key");
  resetEnvCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvCacheForTests();
});

async function fixture() {
  const f = await workflowFixture();
  const {
    requestIds: [id],
  } = await generateRequests(f.actor, f.input);
  const request = await getOwnedRequest(f.actor, id!);
  const envelope = readApprovalEnvelope(request.snapshots[0]!);
  return { ...f, request, envelope };
}
async function received(to: string, subject: string, providerId = randomUUID()) {
  const raw = {
    type: "email.received",
    created_at: new Date().toISOString(),
    data: { email_id: providerId, from: "broker@example.org", to: [to], subject },
  };
  const stored = await storeAndQueueEmailWebhook({
    provider: "resend",
    eventId: `resend:${randomUUID()}`,
    eventType: raw.type,
    payloadJson: raw,
    signatureVerified: true,
  });
  return { raw, stored };
}
async function claim() {
  const [job] = await claimDueJobs("receiving-tests", 1);
  expect(job?.type).toBe("PROCESS_EMAIL_WEBHOOK");
  return job as ClaimedJob<"PROCESS_EMAIL_WEBHOOK">;
}
function mockContent(
  raw: Awaited<ReturnType<typeof received>>["raw"],
  body = "We have deleted your data. Private incoming content."
) {
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      id: raw.data.email_id,
      from: raw.data.from,
      to: raw.data.to,
      created_at: raw.created_at,
      subject: raw.data.subject,
      text: body,
      html: null,
      attachments: [],
    })
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("optional Resend receiving adapter", () => {
  it("binds a private reply alias to the envelope, retrieves full content and deduplicates provider messages", async () => {
    const f = await fixture();
    expect(f.envelope.replyTo).toMatch(/^bm-[a-f0-9]{48}@replies\.example\.org$/);
    const mailbox = await testPrisma.inboundMailbox.findFirstOrThrow();
    expect(mailbox.addressEnc).not.toContain(f.envelope.replyTo);
    const first = await received(
      f.envelope.replyTo,
      `Re: ${f.request.externalReference}`
    );
    const fetch = mockContent(first.raw);
    const job = await claim();
    await processStoredEmailWebhook(first.stored.id, job);
    await markJobCompleted(job, { message: "Received." }, 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const row = await testPrisma.brokerResponse.findFirstOrThrow();
    expect(row).toMatchObject({
      userId: f.user.id,
      removalRequestId: f.request.id,
      confirmedAt: null,
      classification: "UNCLEAR",
      suggestedClassification: "CONFIRMED_COMPLETED",
    });
    expect(JSON.stringify(row)).not.toContain("Private incoming content");
    expect((await getOwnedResponse(f.actor, row.id)).content.body).toContain(
      "Private incoming content"
    );
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(f.request.status);
    const replay = await received(
      f.envelope.replyTo,
      `Re: ${f.request.externalReference}`,
      first.raw.data.email_id
    );
    mockContent(replay.raw);
    await processStoredEmailWebhook(replay.stored.id, await claim());
    expect(await testPrisma.brokerResponse.count()).toBe(1);
    expect(await testPrisma.notification.count()).toBe(1);
    await deleteResponse(f.actor, row.id);
    expect(
      await testPrisma.emailWebhookEvent.count({
        where: { brokerResponseId: row.id, payloadEnc: { not: null } },
      })
    ).toBe(0);
  });

  it("keeps short and foreign references unmatched for owner review", async () => {
    const a = await fixture();
    const b = await fixture();
    const event = await received(
      a.envelope.replyTo,
      `BM-ABC123 ${b.request.externalReference}`
    );
    mockContent(event.raw);
    await processStoredEmailWebhook(event.stored.id, await claim());
    const row = await testPrisma.brokerResponse.findFirstOrThrow();
    expect(row).toMatchObject({
      userId: a.user.id,
      removalRequestId: null,
      brokerId: null,
    });
    expect((await listOwnedResponses(b.actor)).items).toHaveLength(0);
    await expect(getOwnedResponse(b.actor, row.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      linkResponse(a.actor, {
        responseId: row.id,
        requestId: b.request.id,
        expectedRevision: 0,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await linkResponse(a.actor, {
      responseId: row.id,
      requestId: a.request.id,
      expectedRevision: 0,
    });
    expect((await getOwnedResponse(a.actor, row.id)).removalRequestId).toBe(a.request.id);
  });

  it("does not retrieve unknown recipients or messages for deleted accounts", async () => {
    const f = await fixture();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const unknown = await received(
      "unknown@replies.example.org",
      `Re: ${f.request.externalReference}`
    );
    expect(unknown.stored.processedAt).toBeTruthy();
    expect(
      (
        await testPrisma.emailWebhookEvent.findUniqueOrThrow({
          where: { id: unknown.stored.id },
        })
      ).payloadEnc
    ).toBeNull();
    const event = await received(
      f.envelope.replyTo,
      `Re: ${f.request.externalReference}`
    );
    const job = await claim();
    await markAccountDeletionRequested(f.actor);
    await processStoredEmailWebhook(event.stored.id, job);
    expect(fetch).not.toHaveBeenCalled();
    await anonymiseDeletedAccount(systemActor("purge"), f.user.id);
    expect(await testPrisma.inboundMailbox.count()).toBe(0);
    expect(await testPrisma.brokerResponse.count()).toBe(0);
    expect(
      await testPrisma.emailWebhookEvent.count({ where: { ownerUserId: f.user.id } })
    ).toBe(0);
  });

  it("does not let a stale receiving worker commit after lease replacement", async () => {
    const f = await fixture();
    const event = await received(
      f.envelope.replyTo,
      `Re: ${f.request.externalReference}`
    );
    mockContent(event.raw);
    const stale = await claim();
    await testPrisma.backgroundJob.update({
      where: { id: stale.id },
      data: { lockExpiresAt: new Date(Date.now() - 1000) },
    });
    await expireStaleLocks();
    const current = await claim();
    expect(current.leaseToken).not.toBe(stale.leaseToken);
    await processStoredEmailWebhook(event.stored.id, stale);
    expect(await testPrisma.brokerResponse.count()).toBe(0);
    mockContent(event.raw);
    await processStoredEmailWebhook(event.stored.id, current);
    expect(await testPrisma.brokerResponse.count()).toBe(1);
  });

  it("keeps retrieval failures visible and prevents applying an unreadable reply", async () => {
    const f = await fixture();
    const event = await received(
      f.envelope.replyTo,
      `Re: ${f.request.externalReference}`
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Not found", { status: 404 }))
    );
    await processStoredEmailWebhook(event.stored.id, await claim());
    const row = await testPrisma.brokerResponse.findFirstOrThrow();
    expect(row.bodyEnc).toBeNull();
    expect(
      (await listOwnedResponses(f.actor, { filter: "unmatched" })).items
    ).toHaveLength(1);
    await linkResponse(f.actor, {
      responseId: row.id,
      requestId: f.request.id,
      expectedRevision: 0,
    });
    await expect(
      confirmResponse(f.actor, {
        responseId: row.id,
        expectedRevision: 1,
        expectedRequestStatus: f.request.status,
        classification: "CONFIRMED_COMPLETED",
        applyToRequest: true,
        confirmationAccepted: true,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("invalidates queued approval when receiving configuration changes", async () => {
    const f = await fixture();
    vi.stubEnv("RESEND_RECEIVING_DOMAIN", "new-replies.example.org");
    resetEnvCacheForTests();
    await expect(
      approveRequest(f.actor, {
        requestId: f.request.id,
        envelopeHash: f.request.snapshots[0]!.envelopeHash,
        confirmationAccepted: true,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
