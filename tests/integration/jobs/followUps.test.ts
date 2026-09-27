import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetRuntimeSettingsCacheForTests } from "@/lib/config/runtimeSettings";
import { claimDueJobs, markJobCompleted } from "@/lib/db/repositories/jobs";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { commitFollowUpDraft } from "@/lib/db/repositories/requestFollowUp";
import { renderFollowUpSnapshot } from "@/lib/requests/followUp";
import { createJobHandlers } from "@/lib/jobs/handlers";
import { enqueueJob } from "@/lib/jobs/queue";
import type { ClaimedJob } from "@/lib/jobs/types";
import { systemActor } from "@/lib/permissions/actor";
import {
  closeRequest,
  prepareFollowUp,
  approveRequest,
  generateRequests,
  sendApprovedRequest,
} from "@/lib/requests/lifecycle";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

afterEach(() => {
  vi.restoreAllMocks();
  resetRuntimeSettingsCacheForTests();
});

async function waiting() {
  const fixture = await workflowFixture();
  const {
    requestIds: [id],
  } = await generateRequests(fixture.actor, fixture.input);
  const request = await getOwnedRequest(fixture.actor, id!);
  await approveRequest(fixture.actor, {
    requestId: id,
    envelopeHash: request.snapshots[0]!.envelopeHash,
    confirmationAccepted: true,
  });
  const [job] = await claimDueJobs("initial-send", 1);
  const send = job as ClaimedJob<"SEND_REQUEST">;
  await sendApprovedRequest(
    systemActor(send.id),
    request.id,
    send.payload.attempt,
    send.payload.snapshotId,
    send
  );
  await markJobCompleted(send, { message: "Captured locally" }, 1);
  await testPrisma.removalRequest.update({
    where: { id: request.id },
    data: { deadlineAt: new Date(Date.now() - 14 * 86400_000) },
  });
  return { ...fixture, request };
}

async function watch() {
  const result = await enqueueJob({
    type: "DEADLINE_WATCH",
    payload: { windowDays: 14 },
    idempotencyKey: `watch:${randomUUID()}`,
    priority: 0,
  });
  const [job] = await claimDueJobs("deadline-test", 1);
  expect(job?.id).toBe(result.id);
  return job as ClaimedJob<"DEADLINE_WATCH">;
}

describe("deadline and follow-up recovery", () => {
  it("spaces later reminders from the latest recorded manual submission", async () => {
    const f = await waiting();
    const submittedOn = new Date(new Date().toISOString().slice(0, 10));
    await testPrisma.removalRequest.update({
      where: { id: f.request.id },
      data: { followUpCount: 1, sentAt: new Date(Date.now() - 30 * 86400_000) },
    });
    await testPrisma.manualSubmission.create({
      data: {
        removalRequestId: f.request.id,
        snapshotId: f.request.currentSnapshotId!,
        submittedOn,
        recordedByUserId: f.user.id,
      },
    });
    await createJobHandlers().DEADLINE_WATCH!(await watch());
    const queued = await testPrisma.backgroundJob.findFirstOrThrow({
      where: { type: "PREPARE_FOLLOW_UP" },
    });
    expect(queued.runAt.getTime()).toBe(submittedOn.getTime() + 7 * 86400_000);
  });
  it("queues an overdue draft in a runnable state and requires fresh approval", async () => {
    const f = await waiting();
    const job = await watch();
    await createJobHandlers().DEADLINE_WATCH!(job);
    const scheduled = await getOwnedRequest(f.actor, f.request.id);
    expect(scheduled.status).toBe("FOLLOW_UP_SCHEDULED");
    expect(scheduled.nextFollowUpAt).not.toBeNull();
    const row = await testPrisma.backgroundJob.findFirstOrThrow({
      where: { type: "PREPARE_FOLLOW_UP" },
    });
    // Schedule from the recorded response date, not the day the worker notices it.
    expect(row.runAt.getTime()).toBeLessThanOrEqual(Date.now());
    const jobs = await claimDueJobs("follow-up-test", 5);
    const followUp = jobs.find(
      (x) => x.type === "PREPARE_FOLLOW_UP"
    ) as ClaimedJob<"PREPARE_FOLLOW_UP">;
    expect(followUp).toBeTruthy();
    await createJobHandlers().PREPARE_FOLLOW_UP!(followUp);
    const drafted = await getOwnedRequest(f.actor, f.request.id);
    expect(drafted.status).toBe("AWAITING_USER_APPROVAL");
    expect(drafted.followUpCount).toBe(1);
    expect(drafted.approvedSnapshotId).toBeNull();
    expect(drafted.currentSnapshotId).not.toBe(f.request.currentSnapshotId);
    expect(await testPrisma.outboundEmail.count()).toBe(1);
  });
  it("rolls status, event history and jobs back together when enqueueing fails", async () => {
    const f = await waiting();
    const job = await watch();
    const before = await testPrisma.removalRequestEvent.count();
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_fail_followup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type = 'PREPARE_FOLLOW_UP' THEN RAISE EXCEPTION 'Injected enqueue failure'; END IF; RETURN NEW; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_fail_followup BEFORE INSERT ON "BackgroundJob" FOR EACH ROW EXECUTE FUNCTION test_fail_followup()`
    );
    try {
      await createJobHandlers().DEADLINE_WATCH!(job);
      expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
        "WAITING_FOR_BROKER"
      );
      expect(await testPrisma.removalRequestEvent.count()).toBe(before);
      expect(
        await testPrisma.backgroundJob.count({ where: { type: "PREPARE_FOLLOW_UP" } })
      ).toBe(0);
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_fail_followup ON "BackgroundJob"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_fail_followup()`);
    }
    await createJobHandlers().DEADLINE_WATCH!(job);
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
      "FOLLOW_UP_SCHEDULED"
    );
  });

  it("rejects an expired deadline watch lease without scheduling or notifying", async () => {
    const f = await waiting();
    const job = await watch();
    await testPrisma.backgroundJob.update({
      where: { id: job.id },
      data: { lockExpiresAt: new Date(0) },
    });
    const before = await testPrisma.notification.count();
    await createJobHandlers().DEADLINE_WATCH!(job);
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
      "WAITING_FOR_BROKER"
    );
    expect(await testPrisma.notification.count()).toBe(before);
  });

  it("fences stale preparation after another worker claims the lease", async () => {
    const f = await waiting();
    await prepareFollowUp(f.actor, f.request.id);
    const [old] = await claimDueJobs("old-worker", 1);
    await testPrisma.backgroundJob.update({
      where: { id: old!.id },
      data: { lockExpiresAt: new Date(0) },
    });
    const [current] = await claimDueJobs("new-worker", 1);
    expect(current?.leaseToken).not.toBe(old?.leaseToken);
    await createJobHandlers().PREPARE_FOLLOW_UP!(old as ClaimedJob<"PREPARE_FOLLOW_UP">);
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
      "FOLLOW_UP_SCHEDULED"
    );
    await createJobHandlers().PREPARE_FOLLOW_UP!(
      current as ClaimedJob<"PREPARE_FOLLOW_UP">
    );
    expect(await testPrisma.requestSnapshot.count()).toBe(2);
  });

  it("does not publish or notify after the owner closes a claimed preparation", async () => {
    const f = await waiting();
    await prepareFollowUp(f.actor, f.request.id);
    const [job] = await claimDueJobs("closed-worker", 1);
    await closeRequest(f.actor, f.request.id);
    const before = await testPrisma.notification.count();
    await createJobHandlers().PREPARE_FOLLOW_UP!(job as ClaimedJob<"PREPARE_FOLLOW_UP">);
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe("CLOSED");
    expect(await testPrisma.requestSnapshot.count()).toBe(1);
    expect(await testPrisma.notification.count()).toBe(before);
  });

  it("fences publication when the lease expires after rendering finishes", async () => {
    const f = await waiting();
    await prepareFollowUp(f.actor, f.request.id);
    const [job] = await claimDueJobs("render-worker", 1);
    const request = await getOwnedRequest(f.actor, f.request.id);
    const snapshot = await renderFollowUpSnapshot(systemActor(job!.id), request, 1);
    await testPrisma.backgroundJob.update({
      where: { id: job!.id },
      data: { lockExpiresAt: new Date(0) },
    });
    expect(
      await commitFollowUpDraft(systemActor(job!.id), {
        requestId: request.id,
        followUpNumber: 1,
        previousSnapshotId: request.currentSnapshotId,
        job: job!,
        maxFollowUps: 2,
        snapshot,
      })
    ).toEqual({ created: false });
    expect(await testPrisma.requestSnapshot.count()).toBe(1);
    expect((await getOwnedRequest(f.actor, request.id)).status).toBe(
      "FOLLOW_UP_SCHEDULED"
    );
  });

  it("holds revoked consent without repeatedly scheduling it on later watch passes", async () => {
    const f = await waiting();
    await testPrisma.userProfile.update({
      where: { id: f.profile.id },
      data: { kind: "HOUSEHOLD_ADULT", consentStatus: "NOT_ALLOWED" },
    });
    const job = await watch();
    await createJobHandlers().DEADLINE_WATCH!(job);
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe("NO_RESPONSE");
    expect(
      await testPrisma.backgroundJob.count({ where: { type: "PREPARE_FOLLOW_UP" } })
    ).toBe(0);
    const notices = await testPrisma.notification.count();
    await createJobHandlers().DEADLINE_WATCH!(job);
    expect(await testPrisma.notification.count()).toBe(notices);
  });

  it("recovers a failed preparation without duplicate jobs or drafts", async () => {
    const f = await waiting();
    await prepareFollowUp(f.actor, f.request.id);
    const old = await testPrisma.backgroundJob.findFirstOrThrow({
      where: { type: "PREPARE_FOLLOW_UP" },
    });
    await testPrisma.backgroundJob.update({
      where: { id: old.id },
      data: { status: "FAILED", attemptCount: 5 },
    });
    await Promise.all([
      prepareFollowUp(f.actor, f.request.id),
      prepareFollowUp(f.actor, f.request.id),
    ]);
    const [job] = await claimDueJobs("retry-worker", 1);
    expect(job?.id).toBe(old.id);
    expect(job?.attemptCount).toBe(1);
    await createJobHandlers().PREPARE_FOLLOW_UP!(job as ClaimedJob<"PREPARE_FOLLOW_UP">);
    expect(
      await testPrisma.backgroundJob.count({ where: { type: "PREPARE_FOLLOW_UP" } })
    ).toBe(1);
    expect(await testPrisma.requestSnapshot.count()).toBe(2);
  });

  it("handles disabled follow-ups without creating an impossible job", async () => {
    const f = await waiting();
    await testPrisma.systemSetting.create({
      data: { key: "follow_up.max_attempts", valueJson: 0, description: "Test setting" },
    });
    resetRuntimeSettingsCacheForTests();
    const job = await watch();
    await createJobHandlers().DEADLINE_WATCH!(job);
    expect((await getOwnedRequest(f.actor, f.request.id)).status).toBe(
      "ESCALATION_RECOMMENDED"
    );
    expect(
      await testPrisma.backgroundJob.count({ where: { type: "PREPARE_FOLLOW_UP" } })
    ).toBe(0);
    expect(await testPrisma.outboundEmail.count()).toBe(1);
  });
});
