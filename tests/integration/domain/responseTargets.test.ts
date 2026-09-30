import { describe, expect, it } from "vitest";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { listRequestEvents } from "@/lib/db/repositories/requestHistory";
import { claimDueJobs, markJobCompleted } from "@/lib/db/repositories/jobs";
import { createJobHandlers } from "@/lib/jobs/handlers";
import { enqueueJob } from "@/lib/jobs/queue";
import { randomUUID } from "node:crypto";
import type { ClaimedJob } from "@/lib/jobs/types";
import { getRequestReceiptContext } from "@/lib/db/repositories/requestReceipt";
import { formatIsoDate, dateInTimeZone } from "@/lib/format/datetime";
import { systemActor } from "@/lib/permissions/actor";
import {
  approveRequest,
  generateRequests,
  prepareFollowUp,
  prepareFollowUpDraft,
  sendApprovedRequest,
} from "@/lib/requests/lifecycle";
import { recordManualSubmission } from "@/lib/requests/manual";
import { recordRequestReceipt } from "@/lib/requests/receipt";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

async function prepared(manual = true) {
  const f = await workflowFixture();
  if (manual)
    await testPrisma.brokerContactMethod.updateMany({
      where: { brokerId: f.brokers[0]!.id },
      data: { type: "WEB_FORM", value: "https://example.org/privacy" },
    });
  const {
    requestIds: [id],
  } = await generateRequests(f.actor, f.input);
  const draft = await getOwnedRequest(f.actor, id!);
  expect(draft.deadlineAt).toBeNull();
  expect(draft.deadlineAnchorOn).toBeNull();
  await approveRequest(f.actor, {
    requestId: id,
    envelopeHash: draft.snapshots[0]!.envelopeHash,
    confirmationAccepted: true,
  });
  return { ...f, requestId: id!, draft, today: dateInTimeZone(new Date(), "UTC") };
}
async function submit(f: Awaited<ReturnType<typeof prepared>>, received = false) {
  await recordManualSubmission(f.actor, {
    requestId: f.requestId,
    snapshotId: f.draft.currentSnapshotId!,
    submittedOn: f.today,
    receivedOn: received ? f.today : null,
    evidenceFileId: null,
    confirmationAccepted: true,
  });
  return getOwnedRequest(f.actor, f.requestId);
}
function correction(
  request: Awaited<ReturnType<typeof getOwnedRequest>>,
  receivedOn: string
) {
  return {
    requestId: request.id,
    receivedOn,
    previousAnchorOn: request.deadlineAnchorOn
      ? formatIsoDate(request.deadlineAnchorOn)
      : null,
    previousBasis: request.deadlineBasis,
    confirmationAccepted: true,
  };
}
describe("persisted response clocks and recorded receipts", () => {
  it("cancels an obsolete automatic preparation and fences its worker when receipt moves the target into the future", async () => {
    const f = await prepared();
    await submit(f);
    await testPrisma.removalRequest.update({
      where: { id: f.requestId },
      data: { deadlineAt: new Date(Date.now() - 14 * 86400_000) },
    });
    await enqueueJob({
      type: "DEADLINE_WATCH",
      payload: { windowDays: 14 },
      idempotencyKey: `receipt-watch:${randomUUID()}`,
      priority: 0,
    });
    const [watch] = await claimDueJobs("receipt-watch", 1);
    await createJobHandlers().DEADLINE_WATCH!(watch as ClaimedJob<"DEADLINE_WATCH">);
    await markJobCompleted(watch!, { message: "Automatic reminder scheduled" }, 1);
    const scheduled = await getOwnedRequest(f.actor, f.requestId);
    expect(scheduled.status).toBe("FOLLOW_UP_SCHEDULED");
    const jobs = await claimDueJobs("receipt-obsolete-preparation", 5);
    const old = jobs.find(
      (job) => job.type === "PREPARE_FOLLOW_UP"
    ) as ClaimedJob<"PREPARE_FOLLOW_UP">;
    expect(old).toBeTruthy();
    await recordRequestReceipt(f.actor, correction(scheduled, f.today));
    const corrected = await getOwnedRequest(f.actor, f.requestId);
    expect(corrected.status).toBe("WAITING_FOR_BROKER");
    expect(corrected.nextFollowUpAt).toBeNull();
    expect(corrected.currentSnapshotId).toBe(scheduled.currentSnapshotId);
    expect(corrected.snapshots[0]!.body).toBe(scheduled.snapshots[0]!.body);
    expect(corrected.deadlineAt!.getTime()).toBeGreaterThan(Date.now());
    await createJobHandlers().PREPARE_FOLLOW_UP!(old);
    expect(await markJobCompleted(old, { message: "Obsolete worker" }, 1)).toBe(false);
    expect((await getOwnedRequest(f.actor, f.requestId)).followUpCount).toBe(0);
    expect(
      await testPrisma.backgroundJob.count({
        where: {
          relatedRequestId: f.requestId,
          type: { in: ["PREPARE_FOLLOW_UP", "RECHECK_REMINDER"] },
          status: { in: ["PENDING", "RUNNING", "RETRYABLE"] },
        },
      })
    ).toBe(0);
  });

  it("preserves an owner's explicitly requested reminder across a receipt correction", async () => {
    const f = await prepared();
    await submit(f);
    await prepareFollowUp(f.actor, f.requestId, "FOLLOW_UP");
    const scheduled = await getOwnedRequest(f.actor, f.requestId);
    await recordRequestReceipt(f.actor, correction(scheduled, f.today));
    const next = await getOwnedRequest(f.actor, f.requestId);
    expect(next.status).toBe("FOLLOW_UP_SCHEDULED");
    expect(next.nextFollowUpAt).toEqual(scheduled.nextFollowUpAt);
    expect(
      await testPrisma.backgroundJob.count({
        where: {
          relatedRequestId: f.requestId,
          type: "PREPARE_FOLLOW_UP",
          status: "PENDING",
        },
      })
    ).toBe(1);
  });

  it("starts only after submission and keeps the initial clock when a new follow-up is submitted", async () => {
    const f = await prepared();
    const initial = await submit(f, true);
    expect(initial).toMatchObject({
      deadlineBasis: "RECORDED_RECEIPT",
      deadlinePolicyVersion: 1,
      deadlineSnapshotId: f.draft.currentSnapshotId,
      deadlineIsEstimate: true,
    });
    expect(formatIsoDate(initial.deadlineAnchorOn)).toBe(f.today);
    expect(initial.deadlineAt).toBeTruthy();
    expect(initial.deadlineNote).toMatch(/holiday coverage/);
    await prepareFollowUp(f.actor, f.requestId);
    const [job] = await claimDueJobs("response-clock-follow-up", 1);
    await prepareFollowUpDraft(systemActor(job!.id), f.requestId, 1, job!);
    await markJobCompleted(job!, { message: "Synthetic follow-up." }, 1);
    const next = await getOwnedRequest(f.actor, f.requestId);
    await approveRequest(f.actor, {
      requestId: f.requestId,
      envelopeHash: next.snapshots[0]!.envelopeHash,
      confirmationAccepted: true,
    });
    await recordManualSubmission(f.actor, {
      requestId: f.requestId,
      snapshotId: next.currentSnapshotId,
      submittedOn: f.today,
      receivedOn: f.today,
      evidenceFileId: null,
      confirmationAccepted: true,
    });
    const followed = await getOwnedRequest(f.actor, f.requestId);
    expect(followed.deadlineAt).toEqual(initial.deadlineAt);
    expect(followed.deadlineSnapshotId).toBe(initial.deadlineSnapshotId);
    expect(followed.sentAt).toEqual(initial.sentAt);
  });

  it("records one concurrent correction, rejects foreign and stale inputs, and preserves approved text", async () => {
    const f = await prepared();
    const initial = await submit(f);
    expect(initial.deadlineBasis).toBe("DISPATCH_ESTIMATE");
    expect(await getRequestReceiptContext(f.actor, f.requestId)).toMatchObject({
      snapshotId: f.draft.currentSnapshotId,
      submittedOn: f.today,
    });
    const input = correction(initial, f.today);
    for (const actor of [testActor("foreign"), systemActor("invalid")])
      await expect(recordRequestReceipt(actor, input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    await expect(
      recordRequestReceipt(f.actor, { ...input, receivedOn: "9998-01-01" })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      recordRequestReceipt(f.actor, { ...input, receivedOn: "2000-01-01" })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const results = await Promise.allSettled([
      recordRequestReceipt(f.actor, input),
      recordRequestReceipt(f.actor, input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    const recorded = await getOwnedRequest(f.actor, f.requestId);
    expect(recorded.deadlineBasis).toBe("RECORDED_RECEIPT");
    expect(recorded.currentSnapshotId).toBe(initial.currentSnapshotId);
    expect(recorded.approvedEnvelopeHash).toBe(initial.approvedEnvelopeHash);
    expect(recorded.snapshots[0]!.body).toBe(initial.snapshots[0]!.body);
    expect(
      (await listRequestEvents(f.actor, f.requestId)).items.filter((r) =>
        r.message?.includes("original request’s receipt date")
      )
    ).toHaveLength(1);
  });

  it("rolls a receipt correction back if its history cannot be recorded", async () => {
    const f = await prepared();
    const initial = await submit(f);
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_receipt_history_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected receipt history failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_receipt_history_failure BEFORE INSERT ON "RemovalRequestEvent" FOR EACH ROW EXECUTE FUNCTION test_receipt_history_failure()`
    );
    try {
      await expect(
        recordRequestReceipt(f.actor, correction(initial, f.today))
      ).rejects.toThrow();
      const current = await getOwnedRequest(f.actor, f.requestId);
      expect(current.deadlineAt).toEqual(initial.deadlineAt);
      expect(current.deadlineBasis).toBe("DISPATCH_ESTIMATE");
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_receipt_history_failure ON "RemovalRequestEvent"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_receipt_history_failure()`);
    }
  });

  it("marks mock dispatch explicitly and cannot turn it into a real broker receipt", async () => {
    const f = await prepared(false);
    const [job] = await claimDueJobs("response-clock-mock", 1);
    const payload = job!.payload as { snapshotId: string; attempt: number };
    await sendApprovedRequest(
      systemActor(job!.id),
      f.requestId,
      payload.attempt,
      payload.snapshotId,
      job!
    );
    const sent = await getOwnedRequest(f.actor, f.requestId);
    expect(sent.deadlineBasis).toBe("SIMULATED_DISPATCH");
    expect(sent.deadlineIsEstimate).toBe(true);
    expect(sent.deadlineNote).toMatch(/no broker was contacted/);
    expect(await getRequestReceiptContext(f.actor, f.requestId)).toBeNull();
    await expect(
      recordRequestReceipt(f.actor, correction(sent, f.today))
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
