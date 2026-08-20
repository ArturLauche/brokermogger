/**
 * Background worker entry point.
 *
 * Polls `BackgroundJob` and runs registered handlers. Development and
 * production both use this process (`npm run worker`). There is no Redis.
 *
 * Handlers for sending, follow-ups, notifications, reports, deletion and
 * retention are registered here so a single worker binary covers the MVP.
 */
import { randomUUID } from "node:crypto";

import { env } from "@/lib/config/env";
import { createLogger } from "@/lib/observability/logger";
import { processOnce } from "@/lib/jobs/queue";
import type { JobHandlerRegistry } from "@/lib/jobs/types";
import { createJobHandlers } from "@/lib/jobs/handlers";

const log = createLogger("worker");

async function main(): Promise<void> {
  const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
  const handlers: JobHandlerRegistry = createJobHandlers();

  log.info(
    {
      workerId,
      pollIntervalMs: env.JOB_POLL_INTERVAL_MS,
      batchSize: env.JOB_BATCH_SIZE,
    },
    "Worker started"
  );

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    try {
      const processed = await processOnce(workerId, handlers);
      if (processed === 0) {
        await sleep(env.JOB_POLL_INTERVAL_MS);
      }
    } catch (error) {
      log.error({ err: error }, "Worker loop failed");
      await sleep(env.JOB_POLL_INTERVAL_MS);
    }
  }

  log.info({ workerId }, "Worker stopped");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error) => {
  log.error({ err: error }, "Worker exited");
  process.exitCode = 1;
});
