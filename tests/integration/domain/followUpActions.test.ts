import { afterEach, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { resetCatalogCacheForTests } from "@/lib/db/repositories/catalog";
import { resetRuntimeSettingsCacheForTests } from "@/lib/config/runtimeSettings";
import { enqueueJob } from "@/lib/jobs/queue";
import { claimDueJobs, markJobCompleted } from "@/lib/db/repositories/jobs";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { createJobHandlers } from "@/lib/jobs/handlers";
import { regenerateRequestDraft, editRequestDraft } from "@/lib/requests/editing";
import { readApprovalEnvelope } from "@/lib/requests/envelope";
import {
  approveRequest,
  generateRequests,
  prepareFollowUp,
} from "@/lib/requests/lifecycle";
import { prepareFollowUpDraft } from "@/lib/requests/followUp";
import { prepareEscalation, escalationSummaryText } from "@/lib/requests/escalation";
import { getEscalationSummary } from "@/lib/db/repositories/requestEscalation";
import { testActor } from "../../helpers/actor";
import { systemActor } from "@/lib/permissions/actor";
import type { ClaimedJob } from "@/lib/jobs/types";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

afterEach(() => resetRuntimeSettingsCacheForTests());

async function sent() {
  const f = await workflowFixture();
  const {
    requestIds: [id],
  } = await generateRequests(f.actor, f.input);
  const request = await getOwnedRequest(f.actor, id!);
  await approveRequest(f.actor, {
    requestId: request.id,
    envelopeHash: request.snapshots[0]!.envelopeHash,
    confirmationAccepted: true,
  });
  const [job] = await claimDueJobs("follow-up-actions", 1);
  await createJobHandlers().SEND_REQUEST!(
    job as Parameters<
      NonNullable<ReturnType<typeof createJobHandlers>["SEND_REQUEST"]>
    >[0]
  );
  await markJobCompleted(job!, { message: "Simulated" }, 1);
  return { ...f, request: await getOwnedRequest(f.actor, id!) };
}
async function prepare(f: Awaited<ReturnType<typeof sent>>) {
  await prepareFollowUp(f.actor, f.request.id);
  const [job] = await claimDueJobs("prepare-follow-up-actions", 1);
  await createJobHandlers().PREPARE_FOLLOW_UP!(
    job as Parameters<
      NonNullable<ReturnType<typeof createJobHandlers>["PREPARE_FOLLOW_UP"]>
    >[0]
  );
  await markJobCompleted(job!, { message: "Prepared" }, 1);
  return getOwnedRequest(f.actor, f.request.id);
}

describe("contextual follow-up actions", () => {
  it("uses a fresh legal version for a new follow-up without rewriting the original message or clock", async () => {
    const f = await sent();
    const original = f.request.snapshots[0]!;
    const version = await testPrisma.legalRuleVersion.findUniqueOrThrow({
      where: { id: f.request.legalRuleVersionId! },
    });
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...content } = version;
    const replacement = await testPrisma.legalRuleVersion.create({
      data: {
        ...content,
        deadlineRule: content.deadlineRule ?? Prisma.JsonNull,
        verificationRequirements: content.verificationRequirements ?? Prisma.JsonNull,
        templateClauses: content.templateClauses ?? Prisma.JsonNull,
        additionalSources: content.additionalSources ?? Prisma.JsonNull,
        version: version.version + 1,
        effectiveFrom: new Date(Date.now() - 1000),
        legalBasisText:
          "the reviewed current GDPR rule, subject to applicability and retention exceptions",
      },
    });
    resetCatalogCacheForTests();
    const followUp = await prepare(f);
    expect(followUp.legalRuleVersionId).toBe(replacement.id);
    expect(followUp.snapshots[0]!.body).toContain(replacement.legalBasisText);
    expect(readApprovalEnvelope(followUp.snapshots[0]!).legalRuleVersionId).toBe(
      replacement.id
    );
    expect(followUp.deadlineSnapshotId).toBe(f.request.deadlineSnapshotId);
    expect(followUp.deadlineAt).toEqual(f.request.deadlineAt);
    expect(
      (await testPrisma.requestSnapshot.findUniqueOrThrow({ where: { id: original.id } }))
        .contentHash
    ).toBe(original.contentHash);
    await approveRequest(f.actor, {
      requestId: followUp.id,
      envelopeHash: followUp.snapshots[0]!.envelopeHash,
      confirmationAccepted: true,
    });
  });

  it("prepares an owner-only escalation summary, cancels pending reminders atomically and labels simulations", async () => {
    const f = await sent();
    await expect(prepareEscalation(f.actor, f.request.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await testPrisma.removalRequest.update({
      where: { id: f.request.id },
      data: { deadlineAt: new Date(Date.now() - 86400_000) },
    });
    await prepareFollowUp(f.actor, f.request.id);
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_escalation_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."toStatus" = 'ESCALATION_RECOMMENDED' THEN RAISE EXCEPTION 'Injected escalation failure'; END IF; RETURN NEW; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_escalation_failure BEFORE INSERT ON "RemovalRequestEvent" FOR EACH ROW EXECUTE FUNCTION test_escalation_failure()`
    );
    try {
      await expect(prepareEscalation(f.actor, f.request.id)).rejects.toThrow();
      expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
        "FOLLOW_UP_SCHEDULED"
      );
      expect(
        await testPrisma.backgroundJob.count({
          where: { type: "PREPARE_FOLLOW_UP", status: "PENDING" },
        })
      ).toBe(1);
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_escalation_failure ON "RemovalRequestEvent"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_escalation_failure()`);
    }
    await prepareEscalation(f.actor, f.request.id);
    expect(
      await testPrisma.backgroundJob.count({
        where: { type: "PREPARE_FOLLOW_UP", status: "CANCELLED" },
      })
    ).toBe(1);
    const summary = await getEscalationSummary(f.actor, f.request.id);
    expect(summary.simulatedEmails).toBe(1);
    expect(summary.realAcceptedEmails).toBe(0);
    const text = escalationSummaryText(summary);
    expect(text).toContain("has not contacted an authority");
    expect(text).not.toContain("Alex Sample");
    expect(text).not.toContain("alex@example.org");
    expect(await testPrisma.outboundEmail.count()).toBe(1);
    const foreign = testActor("foreign", "INSTANCE_ADMIN", {
      adminGrant: {
        adminActionId: "grant",
        scope: `user:${f.user.id}`,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await expect(prepareEscalation(foreign, f.request.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(getEscalationSummary(foreign, f.request.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await testPrisma.user.update({
      where: { id: f.user.id },
      data: { status: "PENDING_DELETION" },
    });
    await expect(getEscalationSummary(f.actor, f.request.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("requires a submitted follow-up before a final reminder, fences its kind and preserves that kind through edits", async () => {
    const f = await sent();
    await testPrisma.systemSetting.create({
      data: {
        key: "follow_up.max_attempts",
        valueJson: 5,
        description: "Synthetic test limit",
      },
    });
    resetRuntimeSettingsCacheForTests();
    await expect(
      prepareFollowUp(f.actor, f.request.id, "FINAL_REMINDER")
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const first = await prepare(f);
    await approveRequest(f.actor, {
      requestId: first.id,
      envelopeHash: first.snapshots[0]!.envelopeHash,
      confirmationAccepted: true,
    });
    const [send] = await claimDueJobs("send-first-reminder", 1);
    await createJobHandlers().SEND_REQUEST!(send as ClaimedJob<"SEND_REQUEST">);
    await markJobCompleted(send!, { message: "Simulated" }, 1);
    await prepareFollowUp(f.actor, first.id, "FINAL_REMINDER");
    const [claimed] = await claimDueJobs("final-reminder", 1);
    const job = claimed as ClaimedJob<"PREPARE_FOLLOW_UP">;
    await prepareFollowUpDraft(systemActor(job.id), first.id, 2, job, "FOLLOW_UP");
    expect((await getOwnedRequest(f.actor, first.id)).status).toBe("FOLLOW_UP_SCHEDULED");
    await createJobHandlers().PREPARE_FOLLOW_UP!(job);
    await markJobCompleted(job, { message: "Prepared final reminder" }, 1);
    const final = await getOwnedRequest(f.actor, first.id);
    expect(final.snapshots[0]!.subject).toMatch(/^Final reminder:/);
    expect(final.approvedSnapshotId).toBeNull();
    const edited = await editRequestDraft(f.actor, {
      requestId: final.id,
      previousSnapshotId: final.currentSnapshotId,
      subject: final.snapshots[0]!.subject,
      body: `${final.snapshots[0]!.body}\nPlease confirm receipt.`,
    });
    await regenerateRequestDraft(f.actor, final.id, edited.snapshotId);
    const regenerated = await getOwnedRequest(f.actor, final.id);
    expect(regenerated.snapshots[0]!.subject).toMatch(/^Final reminder:/);
    await approveRequest(f.actor, {
      requestId: final.id,
      envelopeHash: regenerated.snapshots[0]!.envelopeHash,
      confirmationAccepted: true,
    });
    const [finalSend] = await claimDueJobs("send-final-reminder", 1);
    await createJobHandlers().SEND_REQUEST!(finalSend as ClaimedJob<"SEND_REQUEST">);
    await markJobCompleted(finalSend!, { message: "Simulated" }, 1);
    await expect(prepareFollowUp(f.actor, final.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await testPrisma.removalRequest.update({
      where: { id: final.id },
      data: { deadlineAt: new Date(Date.now() - 86400_000) },
    });
    await enqueueJob({
      type: "DEADLINE_WATCH",
      payload: { windowDays: 14 },
      idempotencyKey: "after-final-reminder",
      priority: 0,
    });
    const [watch] = await claimDueJobs("after-final-reminder", 1);
    await createJobHandlers().DEADLINE_WATCH!(watch as ClaimedJob<"DEADLINE_WATCH">);
    expect((await getOwnedRequest(f.actor, final.id)).status).toBe(
      "ESCALATION_RECOMMENDED"
    );
    expect(
      await testPrisma.backgroundJob.count({
        where: { idempotencyKey: `follow-up:${final.id}:3` },
      })
    ).toBe(0);
  });
  it("regenerates a follow-up to the current contact and channel without changing submitted history", async () => {
    const f = await sent();
    const draft = await prepare(f);
    await testPrisma.brokerContactMethod.updateMany({
      where: { brokerId: f.brokers[0]!.id },
      data: { deletedAt: new Date() },
    });
    await testPrisma.brokerContactMethod.create({
      data: {
        brokerId: f.brokers[0]!.id,
        type: "PRIVACY_PORTAL_URL",
        value: "https://example.org/new-privacy",
        isVerified: true,
        isPreferred: true,
      },
    });
    await regenerateRequestDraft(f.actor, draft.id, draft.currentSnapshotId!);
    const current = await getOwnedRequest(f.actor, draft.id);
    expect(readApprovalEnvelope(current.snapshots[0]!)).toMatchObject({
      channel: "WEB_FORM",
      destination: "https://example.org/new-privacy",
      followUpNumber: 1,
    });
    expect(current.approvedSnapshotId).toBeNull();
    const original = await testPrisma.requestSnapshot.findUniqueOrThrow({
      where: { id: f.request.currentSnapshotId! },
    });
    expect(readApprovalEnvelope(original).destination).toBe("privacy@example.org");
  });
});
