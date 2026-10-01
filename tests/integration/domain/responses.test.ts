import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getOwnedResponse, listOwnedResponses } from "@/lib/db/repositories/responses";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { claimDueJobs } from "@/lib/db/repositories/jobs";
import { eraseProfileContent } from "@/lib/db/repositories/profileErasure";
import { backfillPrivatePayloads } from "@/lib/db/repositories/privacyMigration";
import { systemActor } from "@/lib/permissions/actor";
import {
  generateRequests,
  approveRequest,
  prepareFollowUp,
  prepareFollowUpDraft,
} from "@/lib/requests/lifecycle";
import { recordManualSubmission } from "@/lib/requests/manual";
import {
  recordResponse,
  confirmResponse,
  linkResponse,
  deleteResponse,
} from "@/lib/responses/service";
import { readResponseContent } from "@/lib/responses/content";
import { decryptField } from "@/lib/security/crypto";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

async function fixture(submit = true) {
  const f = await workflowFixture();
  await testPrisma.brokerContactMethod.updateMany({
    where: { brokerId: f.brokers[0]!.id },
    data: { type: "WEB_FORM", value: "https://example.org/privacy" },
  });
  const {
    requestIds: [id],
  } = await generateRequests(f.actor, f.input);
  const request = await getOwnedRequest(f.actor, id!);
  if (submit) {
    await approveRequest(f.actor, {
      requestId: id,
      envelopeHash: request.snapshots[0]!.envelopeHash,
      confirmationAccepted: true,
    });
    await recordManualSubmission(f.actor, {
      requestId: id,
      snapshotId: request.currentSnapshotId,
      submittedOn: new Date().toISOString().slice(0, 10),
      receivedOn: null,
      evidenceFileId: null,
      confirmationAccepted: true,
    });
  }
  const reply = {
    requestId: id!,
    submissionKey: randomUUID(),
    receivedOn: new Date().toISOString().slice(0, 10),
    channel: "EMAIL",
    fromAddress: "Reply <privacy@example.org>",
    subject: "Your privacy request",
    body: "We have deleted your data. Private reference: Alex Sample.",
    evidenceFileId: null,
  };
  return { ...f, request, reply };
}

describe("recorded correspondence and explicit outcomes", () => {
  it("marks a limited request preview and keeps every reply reachable through correspondence pagination", async () => {
    const f = await fixture(false);
    expect((await getOwnedRequest(f.actor, f.request.id)).responsesTruncated).toBe(false);
    const now = new Date();
    await testPrisma.brokerResponse.createMany({
      data: Array.from({ length: 26 }, (_, index) => ({
        id: randomUUID(),
        userId: f.user.id,
        removalRequestId: f.request.id,
        brokerId: f.brokers[0]!.id,
        receivedAt: new Date(now.getTime() - index * 1000),
      })),
    });
    const request = await getOwnedRequest(f.actor, f.request.id);
    expect(request.responsesTruncated).toBe(true);
    expect(request.responses).toHaveLength(25);
    expect(request._count.responses).toBe(26);
    const first = await listOwnedResponses(f.actor);
    expect(first.items).toHaveLength(25);
    expect(first.nextCursor).toBeTruthy();
    const second = await listOwnedResponses(f.actor, { cursor: first.nextCursor });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(26);
    await testPrisma.brokerResponse.update({
      where: { id: second.items[0]!.id },
      data: { deletedAt: now },
    });
    expect((await getOwnedRequest(f.actor, f.request.id)).responsesTruncated).toBe(false);
    await expect(
      getOwnedRequest(testActor("foreign"), f.request.id)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("encrypts content, deduplicates concurrent saves and leaves status unchanged until confirmation", async () => {
    const f = await fixture();
    const results = await Promise.all([
      recordResponse(f.actor, f.reply),
      recordResponse(f.actor, f.reply),
    ]);
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    const row = await testPrisma.brokerResponse.findFirstOrThrow();
    expect(row).toMatchObject({
      fromAddress: null,
      bodyPreview: null,
      confirmedAt: null,
      classification: "UNCLEAR",
      suggestedClassification: "CONFIRMED_COMPLETED",
    });
    expect(JSON.stringify(row)).not.toContain("Alex Sample");
    expect((await getOwnedResponse(f.actor, row.id)).content.body).toBe(f.reply.body);
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
      "WAITING_FOR_BROKER"
    );
    const command = {
      responseId: row.id,
      expectedRevision: 0,
      expectedRequestStatus: "WAITING_FOR_BROKER",
      classification: "CONFIRMED_COMPLETED",
      applyToRequest: true,
      confirmationAccepted: true,
    };
    await Promise.all([
      confirmResponse(f.actor, command),
      confirmResponse(f.actor, command),
    ]);
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe("COMPLETED");
    expect(
      (await testPrisma.brokerResponse.findFirstOrThrow()).classificationRevision
    ).toBe(1);
  });

  it("refuses foreign, privileged and system confirmation and cannot apply an outcome before submission", async () => {
    const f = await fixture(false);
    const response = await recordResponse(f.actor, f.reply);
    const command = {
      responseId: response.id,
      expectedRevision: 0,
      expectedRequestStatus: f.request.status,
      classification: "CONFIRMED_COMPLETED",
      applyToRequest: true,
      confirmationAccepted: true,
    };
    const foreign = testActor("foreign");
    const emergency = {
      ...foreign,
      role: "INSTANCE_ADMIN" as const,
      adminGrant: {
        adminActionId: "grant",
        scope: `user:${f.user.id}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    };
    for (const actor of [foreign, emergency]) {
      await expect(getOwnedResponse(actor, response.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(confirmResponse(actor, command)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        recordResponse(actor, { ...f.reply, submissionKey: randomUUID() })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(
      confirmResponse(systemActor("unapproved"), command)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(confirmResponse(f.actor, command)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await confirmResponse(f.actor, { ...command, applyToRequest: false });
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(f.request.status);
  });

  it("requires the status the user saw and supports explicit partial, verification and rejection corrections", async () => {
    const f = await fixture();
    const { id } = await recordResponse(f.actor, f.reply);
    const base = {
      responseId: id,
      expectedRevision: 0,
      expectedRequestStatus: "WAITING_FOR_BROKER",
      classification: "PARTIALLY_COMPLETED",
      applyToRequest: true,
      confirmationAccepted: true,
    };
    await expect(
      confirmResponse(f.actor, { ...base, expectedRequestStatus: "SENT" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await confirmResponse(f.actor, base);
    await expect(
      confirmResponse(f.actor, { ...base, classification: "REJECTED" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await confirmResponse(f.actor, {
      ...base,
      expectedRevision: 1,
      expectedRequestStatus: "PARTIALLY_COMPLETED",
      classification: "VERIFICATION_REQUESTED",
    });
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
      "BROKER_REQUESTED_VERIFICATION"
    );
    await confirmResponse(f.actor, {
      ...base,
      expectedRevision: 2,
      expectedRequestStatus: "BROKER_REQUESTED_VERIFICATION",
      classification: "REJECTED",
    });
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe("REJECTED");
  });

  it("withdraws a queued follow-up when a reply resolves its submitted predecessor", async () => {
    const f = await fixture();
    await prepareFollowUp(f.actor, f.request.id);
    const [followUpJob] = await claimDueJobs("reply-follow-up", 1);
    await prepareFollowUpDraft(
      systemActor(followUpJob!.id),
      f.request.id,
      1,
      followUpJob!
    );
    const current = await getOwnedRequest(f.actor, f.request.id);
    const response = await recordResponse(f.actor, f.reply);
    await confirmResponse(f.actor, {
      responseId: response.id,
      expectedRevision: 0,
      expectedRequestStatus: current.status,
      classification: "CONFIRMED_COMPLETED",
      applyToRequest: true,
      confirmationAccepted: true,
    });
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe("COMPLETED");
    expect(
      await testPrisma.backgroundJob.count({
        where: {
          relatedRequestId: f.request.id,
          type: { in: ["SEND_REQUEST", "PREPARE_FOLLOW_UP"] },
          status: { in: ["PENDING", "RETRYABLE", "RUNNING"] },
        },
      })
    ).toBe(0);
  });

  it("rolls confirmation back if its history cannot be written", async () => {
    const f = await fixture();
    const response = await recordResponse(f.actor, f.reply);
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_response_history_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected history failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_response_history_failure BEFORE INSERT ON "RemovalRequestEvent" FOR EACH ROW EXECUTE FUNCTION test_response_history_failure()`
    );
    try {
      await expect(
        confirmResponse(f.actor, {
          responseId: response.id,
          expectedRevision: 0,
          expectedRequestStatus: "WAITING_FOR_BROKER",
          classification: "CONFIRMED_COMPLETED",
          applyToRequest: true,
          confirmationAccepted: true,
        })
      ).rejects.toThrow();
      expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
        "WAITING_FOR_BROKER"
      );
      expect((await testPrisma.brokerResponse.findFirstOrThrow()).confirmedAt).toBeNull();
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_response_history_failure ON "RemovalRequestEvent"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_response_history_failure()`);
    }
  });

  it("does not match an owned reply to another account's request and erases response payloads", async () => {
    const first = await fixture();
    const second = await fixture();
    const reply = await recordResponse(first.actor, first.reply);
    await expect(
      linkResponse(second.actor, {
        responseId: reply.id,
        requestId: second.request.id,
        expectedRevision: 0,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      linkResponse(first.actor, {
        responseId: reply.id,
        requestId: second.request.id,
        expectedRevision: 0,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteResponse(first.actor, reply.id);
    expect(
      await testPrisma.brokerResponse.findUniqueOrThrow({ where: { id: reply.id } })
    ).toMatchObject({
      bodyEnc: null,
      subjectEnc: null,
      fromAddressEnc: null,
      metadataEnc: null,
    });
    expect((await listOwnedResponses(first.actor)).items).toHaveLength(0);
    const next = await recordResponse(first.actor, {
      ...first.reply,
      submissionKey: randomUUID(),
    });
    await eraseProfileContent(first.actor, first.profile.id);
    expect(
      await testPrisma.brokerResponse.findUnique({ where: { id: next.id } })
    ).toBeNull();
  });

  it("encrypts legacy sender, preview and metadata while preserving their full contents", async () => {
    const f = await fixture();
    const legacy = await testPrisma.brokerResponse.create({
      data: {
        userId: f.user.id,
        removalRequestId: f.request.id,
        brokerId: f.brokers[0]!.id,
        receivedAt: new Date(),
        fromAddress: "Private sender <legacy@example.org>",
        bodyPreview: "Legacy private reply",
        rawMetadata: { privateHeader: "private@example.org" },
      },
    });
    expect((await backfillPrivatePayloads()).responses).toBe(1);
    const row = await testPrisma.brokerResponse.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    expect(row).toMatchObject({ fromAddress: null, bodyPreview: null, rawMetadata: {} });
    expect(readResponseContent(row)).toMatchObject({
      fromAddress: legacy.fromAddress,
      body: legacy.bodyPreview,
      previewOnly: true,
    });
    await expect(
      confirmResponse(f.actor, {
        responseId: legacy.id,
        expectedRevision: 0,
        expectedRequestStatus: "WAITING_FOR_BROKER",
        classification: "CONFIRMED_COMPLETED",
        applyToRequest: true,
        confirmationAccepted: true,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      JSON.parse(
        decryptField(row.metadataEnc!, {
          table: "BrokerResponse",
          column: "metadataEnc",
          recordId: row.id,
        })
      )
    ).toMatchObject({
      legacyMetadata: { privateHeader: "private@example.org" },
      legacyPreviewOnly: true,
    });
    expect((await backfillPrivatePayloads()).responses).toBe(0);
  });
});
