/**
 * Runtime validation for job payloads.
 *
 * TypeScript shapes in `types.ts` are the contract. These Zod schemas are the
 * enforcement at enqueue and claim time so a corrupt JSON row cannot reach a
 * handler.
 */
import type { JobType } from "@prisma/client";
import { z } from "zod";

import { ValidationError } from "@/lib/core/errors";
import { entityIdSchema } from "@/lib/validation/ids";
import { followUpKindSchema } from "@/lib/requests/followUpKind";

import type { JobPayload, JobPayloadMap } from "./types";

const JOB_PAYLOAD_SCHEMAS = {
  SEND_REQUEST: z.object({
    removalRequestId: entityIdSchema,
    snapshotId: entityIdSchema,
    attempt: z.number().int().min(1).max(20),
  }),
  PREPARE_FOLLOW_UP: z.object({
    removalRequestId: entityIdSchema,
    followUpNumber: z.number().int().min(1).max(10),
    kind: followUpKindSchema.optional(),
  }),
  DISPATCH_NOTIFICATION: z.object({
    notificationId: entityIdSchema,
  }),
  PROCESS_EMAIL_WEBHOOK: z.object({
    webhookEventId: entityIdSchema,
  }),
  GENERATE_REPORT: z.object({
    reportId: entityIdSchema,
  }),
  GENERATE_ACCOUNT_EXPORT: z.object({ exportId: entityIdSchema }),
  DELETE_ACCOUNT_DATA: z.object({
    userId: entityIdSchema,
    requestedAt: z.string().min(1).max(40),
  }),
  PURGE_EVIDENCE: z.object({
    olderThanIso: z.string().min(1).max(40),
  }),
  PURGE_TEMP_ID_FILES: z.object({
    olderThanIso: z.string().min(1).max(40).optional(),
  }),
  DEADLINE_WATCH: z.object({
    windowDays: z.number().int().min(1).max(90),
  }),
  RECHECK_REMINDER: z.object({
    removalRequestId: entityIdSchema,
  }),
  RETENTION_SWEEP: z.object({
    dryRun: z.boolean(),
  }),
  VERIFY_AUDIT_CHAIN: z.object({}).strict(),
} as const satisfies { [K in JobType]: z.ZodType<JobPayloadMap[K]> };

export function parseJobPayload<T extends JobType>(type: T, raw: unknown): JobPayload<T> {
  const schema = JOB_PAYLOAD_SCHEMAS[type];
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ValidationError("Job payload is invalid.", {
      jobType: type,
      issues: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
  }
  return parsed.data as JobPayload<T>;
}

export function isKnownJobType(value: string): value is JobType {
  return Object.hasOwn(JOB_PAYLOAD_SCHEMAS, value);
}
