import { describe, expect, it } from "vitest";

import { cancelJobRow, retryJobRow } from "@/lib/db/repositories/admin";
import {
  claimDueJobs,
  expireStaleLocks,
  heartbeatJob,
  insertJob,
  markJobCompleted,
  markJobRetryable,
} from "@/lib/db/repositories/jobs";
import { runClaimedJob } from "@/lib/jobs/queue";
import { testPrisma } from "../../helpers/db";

async function queued(key = "lease-test") {
  return insertJob({
    type: "RETENTION_SWEEP",
    payload: { dryRun: true },
    idempotencyKey: key,
  });
}

describe("fenced job leases", () => {
  it("gives concurrent workers distinct jobs", async () => {
    await queued("one");
    await queued("two");
    const claimed = (
      await Promise.all([claimDueJobs("first", 2), claimDueJobs("second", 2)])
    ).flat();
    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map((row) => row.id)).size).toBe(2);
    expect(new Set(claimed.map((row) => row.leaseToken)).size).toBe(2);
  });

  it("rejects completion, retry and renewal from a worker whose lease was replaced", async () => {
    await queued();
    const [old] = await claimDueJobs("old", 1);
    await testPrisma.backgroundJob.update({
      where: { id: old!.id },
      data: { lockExpiresAt: new Date(0) },
    });
    const [current] = await claimDueJobs("new", 1);
    expect(current!.leaseToken).not.toBe(old!.leaseToken);
    expect(await heartbeatJob(old!)).toBe(false);
    expect(await markJobCompleted(old!, { message: "stale" }, 1)).toBe(false);
    expect(
      await markJobRetryable({
        job: old!,
        attemptCount: 1,
        errorMessage: "stale",
        runAt: new Date(),
        durationMs: 1,
      })
    ).toBe(false);
    expect(await markJobCompleted(current!, { message: "current" }, 1)).toBe(true);
    const logs = await testPrisma.backgroundJobLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ message: "current", attempt: 2 });
  });

  it("does not overwrite cancellation after an in-flight handler returns", async () => {
    await queued();
    const [job] = await claimDueJobs("worker", 1);
    await runClaimedJob(job!, {
      RETENTION_SWEEP: async () => {
        await cancelJobRow(job!.id);
        return { message: "finished too late" };
      },
    });
    expect(
      (await testPrisma.backgroundJob.findUniqueOrThrow({ where: { id: job!.id } }))
        .status
    ).toBe("CANCELLED");
    expect(await testPrisma.backgroundJobLog.count()).toBe(0);
    await expect(retryJobRow(job!.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("does not expire a renewed lease or revive an expired one", async () => {
    await queued();
    const [job] = await claimDueJobs("worker", 1);
    expect(await heartbeatJob(job!)).toBe(true);
    expect(await expireStaleLocks()).toBe(0);
    await testPrisma.backgroundJob.update({
      where: { id: job!.id },
      data: { lockExpiresAt: new Date(0), attemptCount: 3 },
    });
    expect(await heartbeatJob(job!)).toBe(false);
    expect(await expireStaleLocks()).toBe(1);
    const failed = await testPrisma.backgroundJob.findUniqueOrThrow({
      where: { id: job!.id },
    });
    expect(failed).toMatchObject({ status: "FAILED", leaseToken: null });
    await retryJobRow(job!.id);
    expect((await claimDueJobs("new", 1))[0]!.attemptCount).toBe(1);
  });

  it("records generic errors without copying exception messages into the database", async () => {
    await queued();
    const [job] = await claimDueJobs("worker", 1);
    await runClaimedJob(job!, {
      RETENTION_SWEEP: async () => {
        throw new Error("private@example.org SQL parameter");
      },
    });
    const rows = await testPrisma.backgroundJob.findMany({ include: { logs: true } });
    expect(JSON.stringify(rows)).not.toContain("private@example.org");
    expect(rows[0]!.status).toBe("RETRYABLE");
  });
});
