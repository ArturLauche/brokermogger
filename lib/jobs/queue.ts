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
  async fail(jobId, error, durationMs) {
    const message = isAppError(error)
      ? error.message
      : error instanceof Error
        ? error.message
        : "Unknown job failure";
    await markJobFailed({
      jobId,
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
  if (isAppError(error)) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Unknown job failure";
}

export async function runClaimedJob(
  job: ClaimedJob,
  handlers: JobHandlerRegistry
): Promise<void> {
  const started = Date.now();
  const handler = handlers[job.type];

  if (!handler) {
    await markJobFailed({
      jobId: job.id,
      attemptCount: job.attemptCount,
      errorMessage: `No handler registered for ${job.type}`,
      durationMs: Date.now() - started,
    });
    log.error({ jobType: job.type, jobId: job.id }, "Missing job handler");
    return;
  }

  try {
    // The registry is keyed by JobType; the payload was stored by the matching enqueue.
    const result = (await (handler as (claimed: ClaimedJob) => Promise<JobResult>)(
      job
    )) as JobResult;
    const durationMs = Date.now() - started;

    // Recurring success uses `repeatAfterSeconds` inside markJobCompleted.
    // `retryAfterSeconds` is a failed attempt that should run again later.
    if (result.retryAfterSeconds && result.retryAfterSeconds > 0) {
      await markJobRetryable({
        jobId: job.id,
        attemptCount: job.attemptCount,
        errorMessage: result.message,
        runAt: new Date(Date.now() + result.retryAfterSeconds * 1000),
        durationMs,
      });
      return;
    }

    await markJobCompleted(job.id, result, durationMs);
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = errorMessage(error);
    const exhausted = job.attemptCount >= job.maxAttempts;

    if (exhausted) {
      await markJobFailed({
        jobId: job.id,
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
      jobId: job.id,
      attemptCount: job.attemptCount,
      errorMessage: message,
      runAt: new Date(Date.now() + delay * 1000),
      durationMs,
    });
    log.warn(
      { jobType: job.type, jobId: job.id, delaySeconds: delay },
      "Job scheduled for retry"
    );
  }
}

export async function processOnce(
  workerId: string,
  handlers: JobHandlerRegistry
): Promise<number> {
  await expireStaleLocks();
  const batch = await claimDueJobs(workerId, env.JOB_BATCH_SIZE);
  for (const job of batch) {
    await runClaimedJob(job, handlers);
  }
  return batch.length;
}

export { postgresJobQueue as jobQueue };
export type { JobHandlerRegistry, JobResult, ClaimedJob } from "./types";
