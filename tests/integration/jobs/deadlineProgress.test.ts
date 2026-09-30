import { describe, expect, it } from "vitest";
import { checkpointDeadlineWatchProgress } from "@/lib/db/repositories/deadlineProgress";
import { claimDueJobs, markJobCompleted } from "@/lib/db/repositories/jobs";
import { enqueueJob } from "@/lib/jobs/queue";
import type { ClaimedJob, DeadlineWatchProgress } from "@/lib/jobs/types";
import { testPrisma } from "../../helpers/db";

describe("fenced deadline scan checkpoints", () => {
  it("resumes the saved boundary and rejects an old or cancelled worker", async () => {
    const queued = await enqueueJob({
      type: "DEADLINE_WATCH",
      payload: { windowDays: 7 },
      idempotencyKey: "checkpoint-fixture",
    });
    const [first] = await claimDueJobs("first-scan", 1);
    const progress: DeadlineWatchProgress = {
      now: "2026-09-30T00:00:00.000Z",
      warningBefore: "2026-10-07T00:00:00.000Z",
      warningsDone: true,
      overdueAfter: { id: "request-1000", deadlineAt: "2026-09-01T00:00:00.000Z" },
    };
    expect(await checkpointDeadlineWatchProgress(first!, progress)).toBe(true);
    expect(
      await markJobCompleted(
        first!,
        { message: "Bounded pass", repeatAfterSeconds: 1 },
        1
      )
    ).toBe(true);
    await testPrisma.backgroundJob.update({
      where: { id: queued.id },
      data: { runAt: new Date(0) },
    });
    const [second] = await claimDueJobs("resumed-scan", 1);
    expect((second as ClaimedJob<"DEADLINE_WATCH">).payload.progress).toEqual(progress);
    expect(await checkpointDeadlineWatchProgress(first!)).toBe(false);
    expect(await markJobCompleted(first!, { message: "Old pass" }, 1)).toBe(false);
    await testPrisma.backgroundJob.update({
      where: { id: queued.id },
      data: { status: "CANCELLED" },
    });
    expect(await checkpointDeadlineWatchProgress(second!)).toBe(false);
    expect(
      (await testPrisma.backgroundJob.findUniqueOrThrow({ where: { id: queued.id } }))
        .payloadJson
    ).toEqual({ windowDays: 7, progress });
  });
});
