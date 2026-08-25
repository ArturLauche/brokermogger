/**
 * Persistence for the PostgreSQL job queue.
 *
 * Claiming uses `FOR UPDATE SKIP LOCKED` so several workers can poll the same
 * table without double-processing a row. Payloads are JSON and must not contain
 * personal data; handlers load the related records themselves.
 */
import type { JobStatus, JobType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { env } from "@/lib/config/env";
import { parseJobPayload } from "@/lib/jobs/payloads";
import type { ClaimedJob, EnqueueOptions, JobResult } from "@/lib/jobs/types";

interface JobRow {
  id: string;
  type: JobType;
  payloadJson: Prisma.JsonValue;
  attemptCount: number;
  maxAttempts: number;
  idempotencyKey: string;
  relatedUserId: string | null;
  relatedRequestId: string | null;
}

function toClaimed(row: JobRow): ClaimedJob {
  return {
    id: row.id,
    type: row.type,
    payload: parseJobPayload(row.type, row.payloadJson ?? {}),
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    idempotencyKey: row.idempotencyKey,
    relatedUserId: row.relatedUserId,
    relatedRequestId: row.relatedRequestId,
  };
}

export async function insertJob<T extends JobType>(
  options: EnqueueOptions<T>
): Promise<{ id: string; created: boolean }> {
  parseJobPayload(options.type, options.payload);

  const existing = await prisma.backgroundJob.findUnique({
    where: { idempotencyKey: options.idempotencyKey },
    select: { id: true, status: true },
  });

  if (existing) {
    return { id: existing.id, created: false };
  }

  try {
    const created = await prisma.backgroundJob.create({
      data: {
        type: options.type,
        status: "PENDING",
        runAt: options.runAt ?? new Date(),
        maxAttempts: options.maxAttempts ?? env.JOB_MAX_ATTEMPTS,
        payloadJson: options.payload as Prisma.InputJsonValue,
        idempotencyKey: options.idempotencyKey,
        relatedUserId: options.relatedUserId ?? null,
        relatedRequestId: options.relatedRequestId ?? null,
        priority: options.priority ?? 100,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  } catch (error) {
    const again = await prisma.backgroundJob.findUnique({
      where: { idempotencyKey: options.idempotencyKey },
      select: { id: true },
    });
    if (again) {
      return { id: again.id, created: false };
    }
    throw error;
  }
}

export async function claimDueJobs(
  workerId: string,
  batchSize: number
): Promise<ClaimedJob[]> {
  const lockSeconds = env.JOB_LOCK_SECONDS;
  const rows = await prisma.$queryRaw<JobRow[]>`
    UPDATE "BackgroundJob" AS job
    SET
      "status" = 'RUNNING',
      "lockedAt" = NOW(),
      "lockedBy" = ${workerId},
      "lockExpiresAt" = NOW() + (${lockSeconds}::text || ' seconds')::interval,
      "attemptCount" = job."attemptCount" + 1,
      "updatedAt" = NOW()
    WHERE job.id IN (
      SELECT id FROM "BackgroundJob"
      WHERE "runAt" <= NOW()
        AND "attemptCount" < "maxAttempts"
        AND (
          "status" IN ('PENDING', 'RETRYABLE')
          OR ("status" = 'RUNNING' AND "lockExpiresAt" IS NOT NULL AND "lockExpiresAt" < NOW())
        )
      ORDER BY "priority" ASC, "runAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      job.id,
      job.type,
      job."payloadJson",
      job."attemptCount",
      job."maxAttempts",
      job."idempotencyKey",
      job."relatedUserId",
      job."relatedRequestId"
  `;

  const claimed: ClaimedJob[] = [];
  for (const row of rows) {
    try {
      claimed.push(toClaimed(row));
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 2000) : "Invalid job payload";
      await markJobFailed({
        jobId: row.id,
        attemptCount: row.attemptCount,
        errorMessage: message,
        durationMs: 0,
      });
    }
  }
  return claimed;
}

export async function markJobCompleted(
  jobId: string,
  result: JobResult,
  durationMs: number
): Promise<void> {
  const repeatAt =
    result.repeatAfterSeconds && result.repeatAfterSeconds > 0
      ? new Date(Date.now() + result.repeatAfterSeconds * 1000)
      : null;

  await prisma.$transaction([
    prisma.backgroundJob.update({
      where: { id: jobId },
      data: repeatAt
        ? {
            status: "PENDING",
            runAt: repeatAt,
            attemptCount: 0,
            completedAt: null,
            lastError: null,
            lockedAt: null,
            lockedBy: null,
            lockExpiresAt: null,
          }
        : {
            status: "COMPLETED",
            completedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lockExpiresAt: null,
            lastError: null,
          },
    }),
    prisma.backgroundJobLog.create({
      data: {
        jobId,
        attempt: 0,
        level: "INFO",
        message: result.message,
        durationMs,
        metadata: (result.metadata ?? {}) as Prisma.InputJsonValue,
      },
    }),
  ]);
}

export async function markJobRetryable(input: {
  jobId: string;
  attemptCount: number;
  errorMessage: string;
  runAt: Date;
  durationMs: number;
}): Promise<void> {
  await prisma.$transaction([
    prisma.backgroundJob.update({
      where: { id: input.jobId },
      data: {
        status: "RETRYABLE",
        runAt: input.runAt,
        lastError: input.errorMessage.slice(0, 2000),
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
      },
    }),
    prisma.backgroundJobLog.create({
      data: {
        jobId: input.jobId,
        attempt: input.attemptCount,
        level: "ERROR",
        message: input.errorMessage.slice(0, 2000),
        durationMs: input.durationMs,
      },
    }),
  ]);
}

export async function markJobFailed(input: {
  jobId: string;
  attemptCount: number;
  errorMessage: string;
  durationMs: number;
}): Promise<void> {
  await prisma.$transaction([
    prisma.backgroundJob.update({
      where: { id: input.jobId },
      data: {
        status: "FAILED",
        lastError: input.errorMessage.slice(0, 2000),
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
      },
    }),
    prisma.backgroundJobLog.create({
      data: {
        jobId: input.jobId,
        attempt: input.attemptCount,
        level: "ERROR",
        message: input.errorMessage.slice(0, 2000),
        durationMs: input.durationMs,
      },
    }),
  ]);
}

export async function markJobCancelled(jobId: string, reason: string): Promise<void> {
  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      lastError: reason.slice(0, 2000),
      lockedAt: null,
      lockedBy: null,
      lockExpiresAt: null,
    },
  });
}

export async function expireStaleLocks(): Promise<number> {
  const result = await prisma.backgroundJob.updateMany({
    where: {
      status: "RUNNING",
      lockExpiresAt: { lt: new Date() },
    },
    data: {
      status: "RETRYABLE",
      lockedAt: null,
      lockedBy: null,
      lockExpiresAt: null,
    },
  });
  return result.count;
}

export async function findJobByIdempotency(
  key: string
): Promise<{ id: string; status: JobStatus } | null> {
  return prisma.backgroundJob.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, status: true },
  });
}

/**
 * Enqueue a recurring job, or revive it when the previous pass completed,
 * failed or was cancelled. Active (pending/running/retryable) rows are left
 * alone so two workers starting at once cannot double-schedule.
 */
export async function ensureRecurringJob<T extends JobType>(
  options: EnqueueOptions<T>
): Promise<{ id: string; created: boolean }> {
  parseJobPayload(options.type, options.payload);

  const existing = await prisma.backgroundJob.findUnique({
    where: { idempotencyKey: options.idempotencyKey },
    select: { id: true, status: true },
  });

  if (!existing) {
    return insertJob(options);
  }

  if (
    existing.status === "PENDING" ||
    existing.status === "RUNNING" ||
    existing.status === "RETRYABLE"
  ) {
    return { id: existing.id, created: false };
  }

  await prisma.backgroundJob.update({
    where: { id: existing.id },
    data: {
      type: options.type,
      status: "PENDING",
      runAt: options.runAt ?? new Date(),
      attemptCount: 0,
      maxAttempts: options.maxAttempts ?? env.JOB_MAX_ATTEMPTS,
      payloadJson: options.payload as Prisma.InputJsonValue,
      lastError: null,
      cancelledAt: null,
      completedAt: null,
      lockedAt: null,
      lockedBy: null,
      lockExpiresAt: null,
      relatedUserId: options.relatedUserId ?? null,
      relatedRequestId: options.relatedRequestId ?? null,
      priority: options.priority ?? 50,
    },
  });

  return { id: existing.id, created: false };
}
