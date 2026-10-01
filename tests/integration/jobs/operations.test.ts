import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  registerWorker,
  refreshWorkerHeartbeat,
  stopWorkerHeartbeat,
  isWorkerHealthy,
} from "@/lib/db/repositories/workers";
import { readOperationalMetrics } from "@/lib/db/repositories/metrics";
import { insertJob } from "@/lib/db/repositories/jobs";
import { testPrisma } from "../../helpers/db";

describe("worker and queue diagnostics", () => {
  it("distinguishes an idle healthy process, a stale process and an explicitly stopped process", async () => {
    const id = `worker-${randomUUID()}`;
    await registerWorker(id);
    expect(await isWorkerHealthy(id)).toBe(true);
    expect((await readOperationalMetrics()).workersActive).toBe(1);
    await testPrisma.workerHeartbeat.update({
      where: { id },
      data: { lastSeenAt: new Date(0) },
    });
    expect(await isWorkerHealthy(id)).toBe(false);
    expect(await refreshWorkerHeartbeat(id)).toBe(true);
    expect(await isWorkerHealthy(id)).toBe(true);
    await stopWorkerHeartbeat(id);
    expect(await refreshWorkerHeartbeat(id)).toBe(false);
    expect(await isWorkerHealthy(id)).toBe(false);
    expect((await readOperationalMetrics()).workersActive).toBe(0);
  });
  it("excludes future scheduled work from queue age and reports deletion and lease backlogs", async () => {
    await insertJob({
      type: "RETENTION_SWEEP",
      payload: { dryRun: true },
      idempotencyKey: "future",
      runAt: new Date(Date.now() + 86_400_000),
    });
    expect(await readOperationalMetrics()).toMatchObject({
      jobsDue: 0,
      oldestDueAgeSeconds: 0,
    });
    await insertJob({
      type: "RETENTION_SWEEP",
      payload: { dryRun: true },
      idempotencyKey: "due",
      runAt: new Date(Date.now() - 120_000),
    });
    await testPrisma.backgroundJob.create({
      data: {
        type: "RETENTION_SWEEP",
        status: "RUNNING",
        lockExpiresAt: new Date(0),
        idempotencyKey: "expired",
        payloadJson: { dryRun: true },
      },
    });
    await testPrisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        status: "PENDING_DELETION",
        deletionRequestedAt: new Date(Date.now() - 300_000),
      },
    });
    const metrics = await readOperationalMetrics();
    expect(metrics).toMatchObject({
      jobsDue: 1,
      expiredJobLeases: 1,
      deletionBacklog: 1,
    });
    expect(metrics.oldestDueAgeSeconds).toBeGreaterThanOrEqual(120);
    expect(metrics.oldestDeletionAgeSeconds).toBeGreaterThanOrEqual(300);
    expect(JSON.stringify(metrics)).not.toContain("example.invalid");
  });
});
