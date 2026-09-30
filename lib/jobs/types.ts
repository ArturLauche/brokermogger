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
  PREPARE_FOLLOW_UP: {
    removalRequestId: string;
    followUpNumber: number;
    kind?: "FOLLOW_UP" | "FINAL_REMINDER" | undefined;
  };
  DISPATCH_NOTIFICATION: { notificationId: string };
  PROCESS_EMAIL_WEBHOOK: { webhookEventId: string };
  GENERATE_REPORT: { reportId: string };
  GENERATE_ACCOUNT_EXPORT: { exportId: string };
  DELETE_ACCOUNT_DATA: { userId: string; requestedAt: string };
  PURGE_EVIDENCE: { olderThanIso: string };
  PURGE_TEMP_ID_FILES: { olderThanIso?: string | undefined };
  DEADLINE_WATCH: { windowDays: number };
  RECHECK_REMINDER: { removalRequestId: string };
  RETENTION_SWEEP: { dryRun: boolean };
  VERIFY_AUDIT_CHAIN: Record<string, never>;
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
  leaseToken: string;
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
  /**
   * Successful recurring pass: keep the same job row, reset attempts, and run
   * again after this many seconds. Distinct from `retryAfterSeconds`, which
   * counts as a failed attempt.
   */
  repeatAfterSeconds?: number;
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
  complete(job: JobLease, result: JobResult, durationMs: number): Promise<boolean>;
  fail(job: JobLease, error: unknown, durationMs: number): Promise<boolean>;
  cancel(job: JobLease, reason: string): Promise<boolean>;
  releaseExpiredLocks(): Promise<number>;
}

export type JobLease = Pick<ClaimedJob, "id" | "leaseToken">;
