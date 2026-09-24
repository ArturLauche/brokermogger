import { afterEach, describe, expect, it, vi } from "vitest";
import { getApprovedManualMessage } from "@/lib/db/repositories/requestManual";
import { getOwnedRequest, applyRequestStatus } from "@/lib/db/repositories/requests";
import {
  markAccountDeletionRequested,
  anonymiseDeletedAccount,
} from "@/lib/db/repositories/account";
import { eraseProfileContent } from "@/lib/db/repositories/profileErasure";
import { claimDueJobs, markJobCompleted } from "@/lib/db/repositories/jobs";
import { getEmailProvider } from "@/lib/email";
import { dateInTimeZone } from "@/lib/format/datetime";
import { systemActor } from "@/lib/permissions/actor";
import {
  approveRequest,
  generateRequests,
  prepareFollowUp,
  prepareFollowUpDraft,
  sendApprovedRequest,
} from "@/lib/requests/lifecycle";
import { editRequestDraft } from "@/lib/requests/editing";
import {
  recordManualSubmission,
  reconcileDelivery,
  recordVerificationAction,
} from "@/lib/requests/manual";
import { uploadEvidence } from "@/lib/evidence/service";
import { testPrisma } from "../../helpers/db";
import { testActor } from "../../helpers/actor";
import { workflowFixture } from "../../helpers/workflow";

afterEach(() => vi.restoreAllMocks());

async function prepared(channel: "WEB_FORM" | "EMAIL" = "WEB_FORM") {
  const f = await workflowFixture();
  if (channel === "WEB_FORM")
    await testPrisma.brokerContactMethod.updateMany({
      where: { brokerId: f.brokers[0]!.id },
      data: { type: "WEB_FORM", value: "https://example.org/privacy" },
    });
  const {
    requestIds: [id],
  } = await generateRequests(f.actor, f.input);
  const request = await getOwnedRequest(f.actor, id!);
  await approveRequest(f.actor, {
    requestId: id,
    envelopeHash: request.snapshots[0]!.envelopeHash,
    confirmationAccepted: true,
  });
  const input = {
    requestId: id!,
    snapshotId: request.currentSnapshotId!,
    submittedOn: dateInTimeZone(new Date(), "UTC"),
    receivedOn: null,
    evidenceFileId: null,
    confirmationAccepted: true,
  };
  return { ...f, request, input };
}

describe("manual submission of approved messages", () => {
  it("records concurrent submission once, pins the snapshot and requires a fresh follow-up", async () => {
    const f = await prepared();
    const letter = await getApprovedManualMessage(f.actor, f.request.id);
    expect(letter.body).toBe(f.request.snapshots[0]!.body);
    const results = await Promise.all([
      recordManualSubmission(f.actor, f.input),
      recordManualSubmission(f.actor, f.input),
    ]);
    expect(results.filter((row) => !row.alreadyRecorded)).toHaveLength(1);
    expect(await testPrisma.manualSubmission.count()).toBe(1);
    const submitted = await getOwnedRequest(f.actor, f.request.id);
    expect(submitted.status).toBe("WAITING_FOR_BROKER");
    expect(submitted.sentAt).toBeTruthy();
    await prepareFollowUp(f.actor, f.request.id);
    await prepareFollowUpDraft(systemActor("manual-follow-up"), f.request.id, 1);
    const followUp = await getOwnedRequest(f.actor, f.request.id);
    expect(followUp.currentSnapshotId).not.toBe(f.input.snapshotId);
    await approveRequest(f.actor, {
      requestId: f.request.id,
      envelopeHash: followUp.snapshots[0]!.envelopeHash,
      confirmationAccepted: true,
    });
    // An already submitted initial request does not prevent editing its unsent follow-up.
    await editRequestDraft(f.actor, {
      requestId: f.request.id,
      previousSnapshotId: followUp.currentSnapshotId,
      subject: "Updated follow-up",
      body: followUp.snapshots[0]!.body,
    });
    expect((await getOwnedRequest(f.actor, f.request.id)).approvedSnapshotId).toBeNull();
  });

  it("rejects foreign, emergency and system claims, future dates, wrong snapshots and expired evidence", async () => {
    const f = await prepared();
    const foreign = testActor("foreign");
    const emergency = {
      ...foreign,
      role: "INSTANCE_ADMIN" as const,
      adminGrant: {
        adminActionId: "test",
        scope: `user:${f.user.id}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    };
    for (const actor of [foreign, emergency, systemActor("invalid")]) {
      await expect(recordManualSubmission(actor, f.input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(getApprovedManualMessage(actor, f.request.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
    await expect(
      recordManualSubmission(f.actor, { ...f.input, snapshotId: "unrelated-snapshot" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      recordManualSubmission(f.actor, { ...f.input, submittedOn: "2099-01-01" })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      recordManualSubmission(f.actor, { ...f.input, submittedOn: "2000-01-01" })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const file = await uploadEvidence(f.actor, {
      requestId: f.request.id,
      kind: "OTHER",
      filename: "receipt.pdf",
      contentType: "application/pdf",
      body: Buffer.from("%PDF-1.7\nSynthetic receipt\n%%EOF"),
    });
    await testPrisma.evidenceFile.update({
      where: { id: file.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      recordManualSubmission(f.actor, { ...f.input, evidenceFileId: file.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await testPrisma.manualSubmission.count()).toBe(0);
  });

  it("checks submission dates in the account's timezone", async () => {
    const f = await prepared();
    await testPrisma.user.update({
      where: { id: f.user.id },
      data: { timezone: "Pacific/Kiritimati" },
    });
    const date = dateInTimeZone(new Date(), "Pacific/Kiritimati");
    await recordManualSubmission(f.actor, {
      ...f.input,
      submittedOn: date,
      receivedOn: date,
    });
    expect(
      (await testPrisma.manualSubmission.findFirstOrThrow()).submittedOn
        .toISOString()
        .slice(0, 10)
    ).toBe(date);
  });

  it("rolls the submission and dates back if writing the status history fails", async () => {
    const f = await prepared();
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_manual_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected history failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_manual_event_failure BEFORE INSERT ON "RemovalRequestEvent" FOR EACH ROW EXECUTE FUNCTION test_manual_event_failure()`
    );
    try {
      await expect(recordManualSubmission(f.actor, f.input)).rejects.toThrow();
      expect(await testPrisma.manualSubmission.count()).toBe(0);
      expect(
        await testPrisma.removalRequest.findUniqueOrThrow({ where: { id: f.request.id } })
      ).toMatchObject({ status: "NEEDS_USER_ACTION", sentAt: null });
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_manual_event_failure ON "RemovalRequestEvent"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_manual_event_failure()`);
    }
  });

  it("erases manual submission details with the profile or account", async () => {
    const f = await prepared();
    await recordManualSubmission(f.actor, f.input);
    await eraseProfileContent(f.actor, f.profile.id);
    expect(await testPrisma.manualSubmission.count()).toBe(0);
    const next = await prepared();
    await recordManualSubmission(next.actor, next.input);
    await markAccountDeletionRequested(next.actor);
    await anonymiseDeletedAccount(systemActor("purge"), next.user.id);
    expect(await testPrisma.manualSubmission.count()).toBe(0);
  });

  it("allows optional identity storage only during a confirmed verification request", async () => {
    const f = await prepared();
    await recordManualSubmission(f.actor, f.input);
    const document = {
      requestId: f.request.id,
      kind: "IDENTITY_DOCUMENT" as const,
      filename: "redacted.pdf",
      contentType: "application/pdf",
      body: Buffer.from("%PDF-1.7\nSynthetic redacted identity\n%%EOF"),
      identityConsent: true,
    };
    await expect(uploadEvidence(f.actor, document)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await testPrisma.brokerResponse.create({
      data: {
        removalRequestId: f.request.id,
        brokerId: f.brokers[0]!.id,
        receivedAt: new Date(),
        classification: "VERIFICATION_REQUESTED",
        confirmedAt: new Date(),
      },
    });
    await applyRequestStatus(systemActor("confirmed-response"), {
      requestId: f.request.id,
      from: "WAITING_FOR_BROKER",
      to: "BROKER_REQUESTED_VERIFICATION",
      message: "Synthetic confirmed response.",
    });
    await expect(
      uploadEvidence(f.actor, { ...document, identityConsent: false })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const file = await uploadEvidence(f.actor, document);
    expect(file.expiresAt).toBeTruthy();
    await recordVerificationAction(f.actor, {
      requestId: f.request.id,
      outcome: "provided",
      confirmationAccepted: true,
    });
    await expect(uploadEvidence(f.actor, document)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
      "WAITING_FOR_BROKER"
    );
  });
});

describe("uncertain delivery reconciliation", () => {
  async function uncertain() {
    const f = await prepared("EMAIL");
    const [job] = await claimDueJobs("manual-reconciliation", 1);
    const payload = job!.payload as {
      removalRequestId: string;
      snapshotId: string;
      attempt: number;
    };
    vi.spyOn(getEmailProvider(), "sendEmail").mockRejectedValueOnce(
      new Error("Injected provider timeout")
    );
    await expect(
      sendApprovedRequest(
        systemActor(job!.id),
        f.request.id,
        payload.attempt,
        payload.snapshotId,
        job!
      )
    ).rejects.toMatchObject({ code: "EMAIL_FAILED" });
    const ledger = await testPrisma.outboundEmail.findFirstOrThrow();
    const command = {
      requestId: f.request.id,
      outboundEmailId: ledger.id,
      outcome: "accepted",
      providerMessageId: "synthetic-provider-id",
      confirmationAccepted: true,
    };
    return { ...f, job: job!, command };
  }
  it("requires an ended lease and records acceptance without sending again", async () => {
    const f = await uncertain();
    await expect(reconcileDelivery(f.actor, f.command)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await markJobCompleted(f.job, { message: "Synthetic worker stopped." }, 1);
    await expect(reconcileDelivery(testActor("other"), f.command)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await reconcileDelivery(f.actor, f.command);
    await reconcileDelivery(f.actor, f.command);
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
      "WAITING_FOR_BROKER"
    );
    expect(await testPrisma.outboundEmail.findFirstOrThrow()).toMatchObject({
      dispatchState: "ACCEPTED",
      reconciledById: f.user.id,
    });
    expect(getEmailProvider().sendEmail).toHaveBeenCalledTimes(1);
    await expect(
      reconcileDelivery(f.actor, { ...f.command, outcome: "not_sent" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("requires new review after confirmed non-acceptance", async () => {
    const f = await uncertain();
    await markJobCompleted(f.job, { message: "Synthetic worker stopped." }, 1);
    await reconcileDelivery(f.actor, { ...f.command, outcome: "not_sent" });
    expect(
      await testPrisma.removalRequest.findUniqueOrThrow({ where: { id: f.request.id } })
    ).toMatchObject({
      status: "DRAFT",
      approvedSnapshotId: null,
      approvalConsentRecordId: null,
    });
    expect((await testPrisma.outboundEmail.findFirstOrThrow()).dispatchState).toBe(
      "CANCELLED"
    );
  });
});
