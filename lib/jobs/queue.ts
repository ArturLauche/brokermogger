/**
 * PostgreSQL job queue implementation.
 *
 * Handlers are registered by the worker process. Application code only calls
 * `enqueue()`. Retries never send a second broker email: that invariant lives
 * in the send handler plus the `OutboundEmail` unique constraint, not here.
 */
import { env } from "@/lib/config/env";
import { isAppError } from "@/lib/core/errors";
import {
  claimDueJobs,
  heartbeatJob,
  hasCurrentLease,
  expireStaleLocks,
  insertJob,
  markJobCancelled,
  markJobCompleted,
  markJobFailed,
  markJobRetryable,
} from "@/lib/db/repositories/jobs";
import { createLogger } from "@/lib/observability/logger";

import { backoffSeconds } from "./backoff";
import type {
  ClaimedJob,
  EnqueueOptions,
  JobHandlerRegistry,
  JobQueue,
  JobResult,
} from "./types";
import type { JobType } from "@prisma/client";

const log = createLogger("jobs");

export const postgresJobQueue: JobQueue = {
  enqueue: insertJob,
  claim: claimDueJobs,
  complete: markJobCompleted,
  async fail(job, error, durationMs) {
    const message = errorMessage(error);
    return markJobFailed({
      job,
      attemptCount: 0,
      errorMessage: message,
      durationMs,
    });
  },
  cancel: markJobCancelled,
  releaseExpiredLocks: expireStaleLocks,
};

export async function enqueueJob<T extends JobType>(
  options: EnqueueOptions<T>
): Promise<{ id: string; created: boolean }> {
  const result = await postgresJobQueue.enqueue(options);
  if (result.created) {
    log.debug({ jobType: options.type, jobId: result.id }, "Job enqueued");
  }
  return result;
}

function errorMessage(error: unknown): string {
  if (isAppError(error))
    return `${error.code}: Job could not complete. Check the related record or instance configuration.`;
  return "Unknown job failure";
}

export async function runClaimedJob(
  job: ClaimedJob,
  handlers: JobHandlerRegistry
): Promise<void> {
  const started = Date.now();
  if (!(await hasCurrentLease(job))) return;
  const handler = handlers[job.type];

  if (!handler) {
    await markJobFailed({
      job,
      attemptCount: job.attemptCount,
      errorMessage: `No handler registered for ${job.type}`,
      durationMs: Date.now() - started,
    });
    log.error({ jobType: job.type, jobId: job.id }, "Missing job handler");
    return;
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const renew = async () => {
    if (stopped) return;
    try {
      if (!(await heartbeatJob(job))) {
        stopped = true;
        return;
      }
    } catch (error) {
      log.error({ jobId: job.id, err: error }, "Worker heartbeat failed");
      stopped = true;
      return;
    }
    if (!stopped) {
      timer = setTimeout(
        () => void renew(),
        Math.max(1000, (env.JOB_LOCK_SECONDS * 1000) / 3)
      );
      timer.unref();
    }
  };
  timer = setTimeout(
    () => void renew(),
    Math.max(1000, (env.JOB_LOCK_SECONDS * 1000) / 3)
  );
  timer.unref();
  try {
    // The registry is keyed by JobType; the payload was stored by the matching enqueue.
    const result = (await (handler as (claimed: ClaimedJob) => Promise<JobResult>)(
      job
    )) as JobResult;
    const durationMs = Date.now() - started;

    // Recurring success uses `repeatAfterSeconds` inside markJobCompleted.
    // `retryAfterSeconds` is a failed attempt that should run again later.
    if (result.retryAfterSeconds && result.retryAfterSeconds > 0) {
      if (job.attemptCount >= job.maxAttempts) {
        await markJobFailed({
          job,
          attemptCount: job.attemptCount,
          errorMessage: result.message,
          durationMs,
        });
        return;
      }
      await markJobRetryable({
        job,
        attemptCount: job.attemptCount,
        errorMessage: result.message,
        runAt: new Date(Date.now() + result.retryAfterSeconds * 1000),
        durationMs,
      });
      return;
    }

    await markJobCompleted(job, result, durationMs);
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = errorMessage(error);
    const exhausted = job.attemptCount >= job.maxAttempts;

    if (exhausted) {
      await markJobFailed({
        job,
        attemptCount: job.attemptCount,
        errorMessage: message,
        durationMs,
      });
      log.error(
        { jobType: job.type, jobId: job.id, err: error },
        "Job failed permanently"
      );
      return;
    }

    const delay = backoffSeconds(job.attemptCount);
    await markJobRetryable({
      job,
      attemptCount: job.attemptCount,
      errorMessage: message,
      runAt: new Date(Date.now() + delay * 1000),
      durationMs,
    });
    log.warn(
      { jobType: job.type, jobId: job.id, delaySeconds: delay },
      "Job scheduled for retry"
    );
  } finally {
    stopped = true;
    clearTimeout(timer);
  }
}

export async function processOnce(
  workerId: string,
  handlers: JobHandlerRegistry
): Promise<number> {
  await expireStaleLocks();
  // Claim only when ready to execute. Jobs waiting in a local batch cannot lose their lease.
  let processed = 0;
  for (; processed < env.JOB_BATCH_SIZE; processed += 1) {
    const [job] = await claimDueJobs(workerId, 1);
    if (!job) break;
    await runClaimedJob(job, handlers);
  }
  return processed;
}

export { postgresJobQueue as jobQueue };
export type { JobHandlerRegistry, JobResult, ClaimedJob } from "./types";
