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
import type { ClaimedJob, EnqueueOptions, JobResult, JobLease } from "@/lib/jobs/types";

interface JobRow {
  id: string;
  leaseToken: string;
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
    leaseToken: row.leaseToken,
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
      "leaseToken" = gen_random_uuid()::text,
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
      job."leaseToken",
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
    } catch {
      const message = "Invalid job payload";
      await markJobFailed({
        job: { id: row.id, leaseToken: row.leaseToken },
        attemptCount: row.attemptCount,
        errorMessage: message,
        durationMs: 0,
      });
    }
  }
  return claimed;
}

/** Database time is authoritative for lease expiry. Never revive an expired lease. */
export async function heartbeatJob(job: JobLease): Promise<boolean> {
  const changed = await prisma.$executeRaw`
    UPDATE "BackgroundJob" SET "lockExpiresAt" = NOW() + (${env.JOB_LOCK_SECONDS}::text || ' seconds')::interval,
      "updatedAt" = NOW()
    WHERE id = ${job.id} AND "leaseToken" = ${job.leaseToken}
      AND status = 'RUNNING' AND "lockExpiresAt" > NOW()
  `;
  return changed === 1;
}

export async function hasCurrentLease(job: JobLease): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "BackgroundJob" WHERE id = ${job.id} AND "leaseToken" = ${job.leaseToken}
      AND status = 'RUNNING' AND "lockExpiresAt" > NOW()
  `;
  return rows.length === 1;
}

const releasedLease = {
  lockedAt: null,
  lockedBy: null,
  lockExpiresAt: null,
  leaseToken: null,
};

async function finishAttempt(
  job: JobLease,
  data: Prisma.BackgroundJobUpdateManyMutationInput,
  log: {
    level: "INFO" | "ERROR";
    message: string;
    durationMs: number;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ attemptCount: number }[]>`
      SELECT "attemptCount" FROM "BackgroundJob" WHERE id = ${job.id}
        AND "leaseToken" = ${job.leaseToken} AND status = 'RUNNING' AND "lockExpiresAt" > NOW()
      FOR UPDATE
    `;
    if (!rows[0]) return false;
    await tx.backgroundJob.update({
      where: { id: job.id },
      data: { ...data, ...releasedLease },
    });
    await tx.backgroundJobLog.create({
      data: {
        jobId: job.id,
        attempt: rows[0].attemptCount,
        level: log.level,
        message: log.message.slice(0, 2000),
        durationMs: log.durationMs,
        metadata: (log.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return true;
  });
}

export async function markJobCompleted(
  job: JobLease,
  result: JobResult,
  durationMs: number
): Promise<boolean> {
  const repeatAt =
    result.repeatAfterSeconds && result.repeatAfterSeconds > 0
      ? new Date(Date.now() + result.repeatAfterSeconds * 1000)
      : null;
  return finishAttempt(
    job,
    repeatAt
      ? {
          status: "PENDING",
          runAt: repeatAt,
          attemptCount: 0,
          completedAt: null,
          lastError: null,
        }
      : { status: "COMPLETED", completedAt: new Date(), lastError: null },
    {
      level: "INFO",
      message: result.message,
      durationMs,
      ...(result.metadata ? { metadata: result.metadata } : {}),
    }
  );
}

export async function markJobRetryable(input: {
  job: JobLease;
  attemptCount: number;
  errorMessage: string;
  runAt: Date;
  durationMs: number;
}): Promise<boolean> {
  return finishAttempt(
    input.job,
    {
      status: "RETRYABLE",
      runAt: input.runAt,
      lastError: input.errorMessage.slice(0, 2000),
    },
    { level: "ERROR", message: input.errorMessage, durationMs: input.durationMs }
  );
}

export async function markJobFailed(input: {
  job: JobLease;
  attemptCount: number;
  errorMessage: string;
  durationMs: number;
}): Promise<boolean> {
  return finishAttempt(
    input.job,
    { status: "FAILED", lastError: input.errorMessage.slice(0, 2000) },
    { level: "ERROR", message: input.errorMessage, durationMs: input.durationMs }
  );
}

export async function markJobCancelled(job: JobLease, reason: string): Promise<boolean> {
  return finishAttempt(
    job,
    { status: "CANCELLED", cancelledAt: new Date(), lastError: reason.slice(0, 2000) },
    { level: "INFO", message: reason, durationMs: 0 }
  );
}

/** One conditional statement cannot accidentally expire a freshly renewed lease. */
export async function expireStaleLocks(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "BackgroundJob" SET
      status = CASE WHEN "attemptCount" >= "maxAttempts" THEN 'FAILED'::"JobStatus" ELSE 'RETRYABLE'::"JobStatus" END,
      "lastError" = 'Worker lease expired. The handler will verify any partial outcome before retrying.',
      "lockedAt" = NULL, "lockedBy" = NULL, "lockExpiresAt" = NULL, "leaseToken" = NULL, "updatedAt" = NOW()
    WHERE status = 'RUNNING' AND "lockExpiresAt" < NOW()
  `;
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
 * failed, was cancelled, or exhausted its retries. Pending and running rows,
 * and retryable rows that still have attempts left, are left alone so two
 * workers starting at once cannot double-schedule.
 */
export async function ensureRecurringJob<T extends JobType>(
  options: EnqueueOptions<T>
): Promise<{ id: string; created: boolean }> {
  parseJobPayload(options.type, options.payload);

  const existing = await prisma.backgroundJob.findUnique({
    where: { idempotencyKey: options.idempotencyKey },
    select: { id: true, status: true, attemptCount: true, maxAttempts: true },
  });

  if (!existing) {
    return insertJob(options);
  }

  if (existing.status === "PENDING" || existing.status === "RUNNING") {
    return { id: existing.id, created: false };
  }

  if (existing.status === "RETRYABLE" && existing.attemptCount < existing.maxAttempts) {
    return { id: existing.id, created: false };
  }

  await prisma.backgroundJob.updateMany({
    where: {
      id: existing.id,
      status: existing.status,
      attemptCount: existing.attemptCount,
    },
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
      leaseToken: null,
      relatedUserId: options.relatedUserId ?? null,
      relatedRequestId: options.relatedRequestId ?? null,
      priority: options.priority ?? 50,
    },
  });

  return { id: existing.id, created: false };
}
