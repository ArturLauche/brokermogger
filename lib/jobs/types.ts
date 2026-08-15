/**
 * PostgreSQL backed job queue contract.
 *
 * No Redis and no BullMQ. Jobs are rows in `BackgroundJob`, claimed with
 * `SELECT ... FOR UPDATE SKIP LOCKED`, and every handler must be idempotent:
 * a retry may re-run a handler that already had a partial effect.
 */
import type { JobType } from "@prisma/client";

/** Payload shape per job type. Payloads never contain personal data. */
export interface JobPayloadMap {
  SEND_REQUEST: { removalRequestId: string; snapshotId: string; attempt: number };
  PREPARE_FOLLOW_UP: { removalRequestId: string; followUpNumber: number };
  DISPATCH_NOTIFICATION: { notificationId: string };
  PROCESS_EMAIL_WEBHOOK: { webhookEventId: string };
  GENERATE_REPORT: { reportId: string };
  DELETE_ACCOUNT_DATA: { userId: string; requestedAt: string };
  PURGE_EVIDENCE: { olderThanIso: string };
  PURGE_TEMP_ID_FILES: { olderThanIso?: string };
  DEADLINE_WATCH: { windowDays: number };
  RECHECK_REMINDER: { removalRequestId: string };
  RETENTION_SWEEP: { dryRun: boolean };
}

export type JobPayload<T extends JobType> = JobPayloadMap[T];

export interface EnqueueOptions<T extends JobType> {
  type: T;
  payload: JobPayload<T>;
  /**
   * Stable key that makes enqueueing idempotent. Two calls with the same key
   * result in exactly one job row.
   */
  idempotencyKey: string;
  runAt?: Date;
  maxAttempts?: number;
  priority?: number;
  relatedUserId?: string;
  relatedRequestId?: string;
}

export interface ClaimedJob<T extends JobType = JobType> {
  id: string;
  type: T;
  payload: JobPayload<T>;
  attemptCount: number;
  maxAttempts: number;
  idempotencyKey: string;
  relatedUserId: string | null;
  relatedRequestId: string | null;
}

export interface JobResult {
  /** Human readable outcome recorded in BackgroundJobLog. */
  message: string;
  /** Structured, non-sensitive detail for metrics. */
  metadata?: Record<string, unknown>;
  /** Ask the queue to run this job again later instead of completing it. */
  retryAfterSeconds?: number;
}

export type JobHandler<T extends JobType> = (job: ClaimedJob<T>) => Promise<JobResult>;

export type JobHandlerRegistry = {
  [K in JobType]?: JobHandler<K>;
};

export interface JobQueue {
  enqueue<T extends JobType>(
    options: EnqueueOptions<T>
  ): Promise<{ id: string; created: boolean }>;
  claim(workerId: string, batchSize: number): Promise<ClaimedJob[]>;
  complete(jobId: string, result: JobResult, durationMs: number): Promise<void>;
  fail(jobId: string, error: unknown, durationMs: number): Promise<void>;
  cancel(jobId: string, reason: string): Promise<void>;
  releaseExpiredLocks(): Promise<number>;
}
