/**
 * Background worker entry point.
 *
 * Polls `BackgroundJob` and runs registered handlers. Development and
 * production both use this process (`npm run worker`). There is no Redis.
 *
 * Handlers for sending, follow-ups, notifications, reports, deletion and
 * retention are registered here so a single worker binary covers the MVP.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { prisma } from "@/lib/db/client";
import {
  registerWorker,
  refreshWorkerHeartbeat,
  stopWorkerHeartbeat,
  WORKER_HEARTBEAT_INTERVAL_MS,
} from "@/lib/db/repositories/workers";

import { env } from "@/lib/config/env";
import { createJobHandlers } from "@/lib/jobs/handlers";
import { processOnce } from "@/lib/jobs/queue";
import { ensureRecurringJobs } from "@/lib/jobs/recurring";
import type { JobHandlerRegistry } from "@/lib/jobs/types";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("worker");

async function main(): Promise<void> {
  const workerId = `worker-${randomUUID()}`;
  const handlers: JobHandlerRegistry = createJobHandlers();

  await ensureRecurringJobs();
  let lastEnsureAt = Date.now();
  const ensureEveryMs = 10 * 60 * 1000;

  log.info(
    {
      workerId,
      pollIntervalMs: env.JOB_POLL_INTERVAL_MS,
      batchSize: env.JOB_BATCH_SIZE,
    },
    "Worker started"
  );

  let stopping = false;
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeatTask: Promise<void> | undefined;
  const stop = () => {
    stopping = true;
    clearTimeout(heartbeatTimer);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  await registerWorker(workerId);
  const heartbeat = async () => {
    try {
      if (!(await refreshWorkerHeartbeat(workerId))) stop();
    } catch (error) {
      log.error({ err: error }, "Worker process heartbeat failed");
    }
    if (!stopping) scheduleHeartbeat();
  };
  const scheduleHeartbeat = () => {
    heartbeatTimer = setTimeout(() => {
      heartbeatTask = heartbeat();
    }, WORKER_HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref();
  };
  try {
    if (env.WORKER_HEALTH_FILE)
      await writeFile(env.WORKER_HEALTH_FILE, workerId, { mode: 0o600 });
    scheduleHeartbeat();
    while (!stopping) {
      try {
        if (Date.now() - lastEnsureAt >= ensureEveryMs) {
          await ensureRecurringJobs();
          lastEnsureAt = Date.now();
        }
        const processed = await processOnce(workerId, handlers, () => stopping);
        if (processed === 0) await sleep(env.JOB_POLL_INTERVAL_MS);
      } catch (error) {
        log.error({ err: error }, "Worker loop failed");
        await sleep(env.JOB_POLL_INTERVAL_MS);
      }
    }
  } finally {
    stop();
    await heartbeatTask;
    await stopWorkerHeartbeat(workerId);
    if (env.WORKER_HEALTH_FILE)
      await unlink(env.WORKER_HEALTH_FILE).catch(() => undefined);
  }

  log.info({ workerId }, "Worker stopped");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    log.error({ err: error }, "Worker exited");
    process.exitCode = 1;
  });
