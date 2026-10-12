import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  registerWorker,
  refreshWorkerHeartbeat,
  stopWorkerHeartbeat,
  isWorkerHealthy,
} from "@/lib/db/repositories/workers";
import { readOperationalMetrics } from "@/lib/db/repositories/metrics";
import { insertJob } from "@/lib/db/repositories/jobs";
import { testPrisma } from "../../helpers/db";
import { anonymousAuditActor, recordAuditOrThrow } from "@/lib/audit/service";
import { env, resetEnvCacheForTests } from "@/lib/config/env";
import { GET as metricsRoute } from "@/app/api/metrics/route";
import type { NextRequest } from "next/server";

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

it("reports committed unattributed auth attempts for the last day through protected metrics", async () => {
  const now = new Date();
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(new Date(now.getTime() - 25 * 60 * 60 * 1000));
    await recordAuditOrThrow({
      actor: anonymousAuditActor("old-synthetic-auth"),
      action: "auth.magic_link.requested",
      resourceType: "user",
    });
    vi.setSystemTime(now);
    for (const action of [
      "auth.magic_link.requested",
      "auth.magic_link.rate_limited",
    ] as const) {
      await recordAuditOrThrow({
        actor: anonymousAuditActor(`synthetic-${action}`),
        action,
        resourceType: "user",
      });
    }
    await recordAuditOrThrow({
      actor: anonymousAuditActor("synthetic-attributed", { ipHash: "synthetic-ip-hash" }),
      action: "auth.magic_link.requested",
      resourceType: "user",
    });
    await recordAuditOrThrow({
      actor: anonymousAuditActor("synthetic-unrelated"),
      action: "auth.sign_out",
      resourceType: "user",
    });
    expect((await readOperationalMetrics()).unknownNetworkAuthAttempts24h).toBe(2);
    vi.stubEnv("METRICS_TOKEN", "synthetic-metrics-token");
    resetEnvCacheForTests();
    const request = (token?: string) =>
      new Request(`${env.APP_BASE_URL}/api/metrics`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }) as NextRequest;
    expect((await metricsRoute(request())).status).toBe(401);
    const response = await metricsRoute(request("synthetic-metrics-token"));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("brokermogger_auth_unknown_network_attempts_24h 2\n");
    expect(body).not.toContain("synthetic-ip-hash");
  } finally {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  }
});
