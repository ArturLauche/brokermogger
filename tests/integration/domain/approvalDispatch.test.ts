import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { markAccountDeletionRequested } from "@/lib/db/repositories/account";
import { claimDueJobs, markJobCompleted } from "@/lib/db/repositories/jobs";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { getEmailProvider } from "@/lib/email";
import { clearMockOutbox, getMockOutbox } from "@/lib/email/providers/mock";
import { systemActor } from "@/lib/permissions/actor";
import {
  approveRequest,
  closeRequest,
  generateRequests,
  prepareFollowUp,
  prepareFollowUpDraft,
  sendApprovedRequest,
} from "@/lib/requests/lifecycle";
import { readApprovalEnvelope, profileIdentityDigest } from "@/lib/requests/envelope";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

afterEach(() => {
  vi.restoreAllMocks();
  clearMockOutbox();
});

async function concurrently<T>(tasks: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(tasks);
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return results.map((result) => (result as PromiseFulfilledResult<T>).value);
}

async function draft(household = false) {
  const fixture = await workflowFixture();
  if (household) {
    await testPrisma.userProfile.update({
      where: { id: fixture.profile.id },
      data: { kind: "HOUSEHOLD_ADULT", consentStatus: "EXPLICIT_CONSENT_OBTAINED" },
    });
    await testPrisma.householdMember.create({
      data: {
        ownerUserId: fixture.user.id,
        profileId: fixture.profile.id,
        relationship: "OTHER_ADULT",
        status: "ACTIVE",
        consents: {
          create: {
            profileId: fixture.profile.id,
            requestedByUserId: fixture.user.id,
            status: "VERIFIED",
            verifiedAt: new Date(),
            contactEmailEnc: "synthetic-unused",
            contactEmailBi: "synthetic-unused",
            contactEmailMasked: "a***@example.org",
            tokenHash: "synthetic-token",
            scope: { profileDigest: profileIdentityDigest(fixture.profile) },
            statementText: "Synthetic consent proof",
            statementHash: "synthetic-hash",
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    });
  }
  const {
    requestIds: [id],
  } = await generateRequests(fixture.actor, fixture.input);
  const request = await getOwnedRequest(fixture.actor, id!);
  const command = {
    requestId: request.id,
    envelopeHash: request.snapshots[0]!.envelopeHash!,
    confirmationAccepted: true,
  };
  return { ...fixture, request, command };
}

async function approveAndClaim(household = false) {
  const fixture = await draft(household);
  await approveRequest(fixture.actor, fixture.command);
  const [job] = await claimDueJobs("dispatch-test", 1);
  const payload = job!.payload as {
    removalRequestId: string;
    snapshotId: string;
    attempt: number;
  };
  return { ...fixture, job: job!, payload };
}

describe("atomic message approval and dispatch", () => {
  it("persists exactly one consent, intent and job under duplicate approval", async () => {
    const fixture = await draft();
    const results = await concurrently([
      approveRequest(fixture.actor, fixture.command),
      approveRequest(fixture.actor, fixture.command),
    ]);
    expect(results.filter((row) => !row.alreadyApproved)).toHaveLength(1);
    expect(
      await testPrisma.consentRecord.count({ where: { purpose: "REQUEST_SUBMISSION" } })
    ).toBe(1);
    expect(await testPrisma.outboundEmail.count()).toBe(1);
    expect(
      await testPrisma.backgroundJob.count({ where: { type: "SEND_REQUEST" } })
    ).toBe(1);
    const request = await testPrisma.removalRequest.findUniqueOrThrow({
      where: { id: fixture.request.id },
    });
    expect(request.approvedSnapshotId).toBe(fixture.request.currentSnapshotId);
    expect(request.approvalConsentRecordId).toBeTruthy();
  });

  it("rolls approval, consent, events and intent back if enqueueing fails", async () => {
    const fixture = await draft();
    const eventsBefore = await testPrisma.removalRequestEvent.count();
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_reject_approval_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected approval job failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_reject_approval_job BEFORE INSERT ON "BackgroundJob" FOR EACH ROW EXECUTE FUNCTION test_reject_approval_job()`
    );
    try {
      await expect(approveRequest(fixture.actor, fixture.command)).rejects.toThrow();
      const request = await testPrisma.removalRequest.findUniqueOrThrow({
        where: { id: fixture.request.id },
      });
      expect(request.status).toBe(fixture.request.status);
      expect(request.approvedAt).toBeNull();
      expect(
        await testPrisma.consentRecord.count({ where: { purpose: "REQUEST_SUBMISSION" } })
      ).toBe(0);
      expect(await testPrisma.outboundEmail.count()).toBe(0);
      expect(await testPrisma.removalRequestEvent.count()).toBe(eventsBefore);
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_reject_approval_job ON "BackgroundJob"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_reject_approval_job()`);
    }
  });

  it("rejects a changed destination and refuses the old text-only approval hash", async () => {
    const fixture = await draft();
    expect(readApprovalEnvelope(fixture.request.snapshots[0]!)).toMatchObject({
      destination: "privacy@example.org",
      identifierIds: [fixture.identifier.id],
    });
    await expect(
      approveRequest(fixture.actor, {
        ...fixture.command,
        envelopeHash: fixture.request.snapshots[0]!.contentHash,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await testPrisma.removalRequest.update({
      where: { id: fixture.request.id },
      data: { destinationValue: "changed@example.org" },
    });
    await expect(approveRequest(fixture.actor, fixture.command)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("refuses foreign or system approval", async () => {
    const fixture = await draft();
    await expect(
      approveRequest(testActor("foreign"), fixture.command)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      approveRequest(systemActor("forbidden-approval"), fixture.command)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sends only the approved message once through the local mock", async () => {
    const fixture = await approveAndClaim();
    const { payload, job } = fixture;
    const send = () =>
      sendApprovedRequest(
        systemActor(job.id),
        fixture.request.id,
        payload.attempt,
        payload.snapshotId,
        job
      );
    await send();
    await send();
    expect(getMockOutbox()).toHaveLength(1);
    expect(getMockOutbox()[0]!.message.text).toBe(fixture.request.snapshots[0]!.body);
    const request = await testPrisma.removalRequest.findUniqueOrThrow({
      where: { id: fixture.request.id },
    });
    expect(request.status).toBe("WAITING_FOR_BROKER");
    expect((await testPrisma.outboundEmail.findFirstOrThrow()).dispatchState).toBe(
      "ACCEPTED"
    );
    expect(await testPrisma.notification.count()).toBe(1);
  });

  it("creates a follow-up atomically and requires a fresh envelope approval", async () => {
    const fixture = await approveAndClaim();
    await sendApprovedRequest(
      systemActor(fixture.job.id),
      fixture.request.id,
      fixture.payload.attempt,
      fixture.payload.snapshotId,
      fixture.job
    );
    await markJobCompleted(fixture.job, { message: "Simulated dispatch complete" }, 1);
    await concurrently([
      prepareFollowUp(fixture.actor, fixture.request.id),
      prepareFollowUp(fixture.actor, fixture.request.id),
    ]);
    expect(
      await testPrisma.backgroundJob.count({ where: { type: "PREPARE_FOLLOW_UP" } })
    ).toBe(1);
    const [followUp] = await claimDueJobs("follow-up", 1);
    await concurrently([
      prepareFollowUpDraft(systemActor(followUp!.id), fixture.request.id, 1, followUp!),
      prepareFollowUpDraft(systemActor(followUp!.id), fixture.request.id, 1, followUp!),
    ]);
    const current = await getOwnedRequest(fixture.actor, fixture.request.id);
    expect(current.followUpCount).toBe(1);
    expect(current.approvedEnvelopeHash).toBeNull();
    expect(current.approvedSnapshotId).toBeNull();
    expect(current.approvalConsentRecordId).toBeNull();
    expect(await testPrisma.requestSnapshot.count()).toBe(2);
    await expect(approveRequest(fixture.actor, fixture.command)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await approveRequest(fixture.actor, {
      ...fixture.command,
      envelopeHash: current.snapshots[0]!.envelopeHash,
    });
    expect(await testPrisma.outboundEmail.count()).toBe(2);
  });

  it("blocks dispatch immediately after an account deletion request", async () => {
    const fixture = await approveAndClaim();
    await markAccountDeletionRequested(fixture.actor);
    await expect(
      sendApprovedRequest(
        systemActor(fixture.job.id),
        fixture.request.id,
        fixture.payload.attempt,
        fixture.payload.snapshotId,
        fixture.job
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getMockOutbox()).toHaveLength(0);
  });

  it("refuses approval after its legal basis is withdrawn without creating work", async () => {
    const fixture = await draft();
    await testPrisma.legalRuleVersion.update({
      where: { id: fixture.request.legalRuleVersionId! },
      data: { status: "ARCHIVED" },
    });
    await expect(approveRequest(fixture.actor, fixture.command)).rejects.toMatchObject({
      code: "LEGAL_RULE_UNAVAILABLE",
    });
    expect(await testPrisma.outboundEmail.count()).toBe(0);
    expect(
      await testPrisma.backgroundJob.count({ where: { type: "SEND_REQUEST" } })
    ).toBe(0);
    expect(
      await testPrisma.consentRecord.count({ where: { purpose: "REQUEST_SUBMISSION" } })
    ).toBe(0);
  });

  it.each(["rule", "jurisdiction", "withdrawn", "replacement"] as const)(
    "stops queued dispatch when the legal %s changes, even with a warm catalogue cache",
    async (change) => {
      const fixture = await approveAndClaim();
      const version = await testPrisma.legalRuleVersion.findUniqueOrThrow({
        where: { id: fixture.request.legalRuleVersionId! },
      });
      if (change === "rule") {
        await testPrisma.legalRule.update({
          where: { id: version.legalRuleId },
          data: { isActive: false },
        });
      } else if (change === "jurisdiction") {
        await testPrisma.jurisdiction.update({
          where: { id: fixture.request.jurisdictionId },
          data: { isActive: false },
        });
      } else if (change === "withdrawn") {
        await testPrisma.legalRuleVersion.update({
          where: { id: version.id },
          data: { status: "ARCHIVED" },
        });
      } else {
        const {
          id: _id,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...content
        } = version;
        await testPrisma.legalRuleVersion.create({
          data: {
            ...content,
            deadlineRule: content.deadlineRule ?? Prisma.JsonNull,
            verificationRequirements: content.verificationRequirements ?? Prisma.JsonNull,
            templateClauses: content.templateClauses ?? Prisma.JsonNull,
            additionalSources: content.additionalSources ?? Prisma.JsonNull,
            version: version.version + 1,
            effectiveFrom: new Date(Date.now() - 1_000),
          },
        });
      }
      const result = await sendApprovedRequest(
        systemActor(fixture.job.id),
        fixture.request.id,
        fixture.payload.attempt,
        fixture.payload.snapshotId,
        fixture.job
      );
      expect(result.message).toMatch(/legal basis.*fresh draft/i);
      expect(getMockOutbox()).toHaveLength(0);
      expect((await getOwnedRequest(fixture.actor, fixture.request.id)).status).toBe(
        "NEEDS_USER_ACTION"
      );
      expect((await testPrisma.outboundEmail.findFirstOrThrow()).dispatchState).toBe(
        "CANCELLED"
      );
      expect(
        (
          await testPrisma.backgroundJob.findUniqueOrThrow({
            where: { id: fixture.job.id },
          })
        ).status
      ).toBe("CANCELLED");
    }
  );

  it("does not activate a scheduled replacement before its effective instant", async () => {
    const fixture = await approveAndClaim();
    const version = await testPrisma.legalRuleVersion.findUniqueOrThrow({
      where: { id: fixture.request.legalRuleVersionId! },
    });
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...content } = version;
    await testPrisma.legalRuleVersion.create({
      data: {
        ...content,
        deadlineRule: content.deadlineRule ?? Prisma.JsonNull,
        verificationRequirements: content.verificationRequirements ?? Prisma.JsonNull,
        templateClauses: content.templateClauses ?? Prisma.JsonNull,
        additionalSources: content.additionalSources ?? Prisma.JsonNull,
        version: version.version + 1,
        effectiveFrom: new Date(Date.now() + 86_400_000),
      },
    });
    await sendApprovedRequest(
      systemActor(fixture.job.id),
      fixture.request.id,
      fixture.payload.attempt,
      fixture.payload.snapshotId,
      fixture.job
    );
    expect(getMockOutbox()).toHaveLength(1);
  });

  it("blocks a verified household approval after consent revocation", async () => {
    const fixture = await approveAndClaim(true);
    await testPrisma.householdConsent.updateMany({
      where: { profileId: fixture.profile.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await expect(
      sendApprovedRequest(
        systemActor(fixture.job.id),
        fixture.request.id,
        fixture.payload.attempt,
        fixture.payload.snapshotId,
        fixture.job
      )
    ).resolves.toMatchObject({
      message: expect.stringContaining("consent is no longer valid"),
    });
    expect((await getOwnedRequest(fixture.actor, fixture.request.id)).status).toBe(
      "NEEDS_USER_ACTION"
    );
    expect((await testPrisma.outboundEmail.findFirstOrThrow()).dispatchState).toBe(
      "CANCELLED"
    );
    expect(getMockOutbox()).toHaveLength(0);
  });

  it.each(["broker", "identifier"])(
    "holds a changed %s and requires fresh approval",
    async (change) => {
      const fixture = await approveAndClaim();
      if (change === "broker")
        await testPrisma.brokerContactMethod.updateMany({
          where: { brokerId: fixture.brokers[0]!.id },
          data: { isActive: false },
        });
      else
        await testPrisma.profileIdentifier.update({
          where: { id: fixture.identifier.id },
          data: { valueBi: "changed-index" },
        });
      const result = await sendApprovedRequest(
        systemActor(fixture.job.id),
        fixture.request.id,
        fixture.payload.attempt,
        fixture.payload.snapshotId,
        fixture.job
      );
      expect(result.message).toMatch(/stopped before contacting/);
      const held = await getOwnedRequest(fixture.actor, fixture.request.id);
      expect(held.status).toBe("NEEDS_USER_ACTION");
      expect(held.approvedSnapshotId).toBeNull();
      expect(
        (
          await testPrisma.backgroundJob.findUniqueOrThrow({
            where: { id: fixture.job.id },
          })
        ).status
      ).toBe("CANCELLED");
      expect((await testPrisma.outboundEmail.findFirstOrThrow()).dispatchState).toBe(
        "CANCELLED"
      );
      expect(
        await testPrisma.notification.count({
          where: { dedupeKey: `dispatch-held:${fixture.job.id}` },
        })
      ).toBe(1);
      expect(getMockOutbox()).toHaveLength(0);
      await expect(approveRequest(fixture.actor, fixture.command)).rejects.toMatchObject({
        code: "CONFLICT",
      });
    }
  );

  it("keeps an uncertain attempt for reconciliation when a live gate changes", async () => {
    const fixture = await approveAndClaim();
    vi.spyOn(getEmailProvider(), "sendEmail").mockRejectedValueOnce(
      new Error("injected timeout")
    );
    const send = () =>
      sendApprovedRequest(
        systemActor(fixture.job.id),
        fixture.request.id,
        fixture.payload.attempt,
        fixture.payload.snapshotId,
        fixture.job
      );
    await expect(send()).rejects.toMatchObject({ code: "EMAIL_FAILED" });
    await testPrisma.brokerContactMethod.updateMany({
      where: { brokerId: fixture.brokers[0]!.id },
      data: { isActive: false },
    });
    expect((await send()).message).toMatch(/uncertain outcome/);
    expect((await testPrisma.outboundEmail.findFirstOrThrow()).dispatchState).toBe(
      "RECONCILIATION_REQUIRED"
    );
    expect(
      (await getOwnedRequest(fixture.actor, fixture.request.id)).approvedSnapshotId
    ).toBeNull();
    expect(getMockOutbox()).toHaveLength(0);
  });

  it("stops replaying an ambiguous attempt after the provider window", async () => {
    const fixture = await approveAndClaim();
    const provider = vi
      .spyOn(getEmailProvider(), "sendEmail")
      .mockRejectedValue(new Error("Injected timeout"));
    const send = () =>
      sendApprovedRequest(
        systemActor(fixture.job.id),
        fixture.request.id,
        fixture.payload.attempt,
        fixture.payload.snapshotId,
        fixture.job
      );
    await expect(send()).rejects.toMatchObject({ code: "EMAIL_FAILED" });
    expect((await testPrisma.outboundEmail.findFirstOrThrow()).dispatchState).toBe(
      "AMBIGUOUS"
    );
    await testPrisma.outboundEmail.updateMany({
      data: { dispatchStartedAt: new Date(Date.now() - 25 * 60 * 60_000) },
    });
    expect(await send()).toMatchObject({
      message: expect.stringContaining("reconciliation"),
    });
    expect(provider).toHaveBeenCalledTimes(1);
    expect((await testPrisma.outboundEmail.findFirstOrThrow()).dispatchState).toBe(
      "RECONCILIATION_REQUIRED"
    );
  });

  it("does not replace a closure with success when a provider returns after cancellation", async () => {
    const fixture = await approveAndClaim();
    vi.spyOn(getEmailProvider(), "sendEmail").mockImplementationOnce(async () => {
      await closeRequest(fixture.actor, fixture.request.id);
      return {
        provider: "MOCK",
        dispatched: false,
        providerMessageId: null,
        sentAt: new Date(),
      };
    });
    const result = await sendApprovedRequest(
      systemActor(fixture.job.id),
      fixture.request.id,
      fixture.payload.attempt,
      fixture.payload.snapshotId,
      fixture.job
    );
    expect(result.message).toContain("reconciliation");
    expect(
      (
        await testPrisma.removalRequest.findUniqueOrThrow({
          where: { id: fixture.request.id },
        })
      ).status
    ).toBe("CLOSED");
    expect((await testPrisma.outboundEmail.findFirstOrThrow()).dispatchState).toBe(
      "RECONCILIATION_REQUIRED"
    );
  });
});
