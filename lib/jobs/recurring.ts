/**
 * Recurring operational jobs. The worker process ensures one row per type so
 * a missed cron tick does not stall retention or deadline watching.
 */
import { ensureRecurringJob } from "@/lib/db/repositories/jobs";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("jobs.recurring");

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

export const RECURRING_INTERVAL_SECONDS = {
  DEADLINE_WATCH: HOUR,
  RETENTION_SWEEP: DAY,
  PURGE_EVIDENCE: 6 * HOUR,
  PURGE_TEMP_ID_FILES: HOUR,
  VERIFY_AUDIT_CHAIN: DAY,
} as const;

export async function ensureRecurringJobs(): Promise<void> {
  const results = await Promise.all([
    ensureRecurringJob({
      type: "DEADLINE_WATCH",
      payload: { windowDays: 7 },
      idempotencyKey: "recurring:DEADLINE_WATCH",
      priority: 40,
    }),
    ensureRecurringJob({
      type: "RETENTION_SWEEP",
      payload: { dryRun: false },
      idempotencyKey: "recurring:RETENTION_SWEEP",
      priority: 80,
    }),
    ensureRecurringJob({
      type: "PURGE_EVIDENCE",
      payload: { olderThanIso: new Date(0).toISOString() },
      idempotencyKey: "recurring:PURGE_EVIDENCE",
      priority: 70,
    }),
    ensureRecurringJob({
      type: "PURGE_TEMP_ID_FILES",
      payload: {},
      idempotencyKey: "recurring:PURGE_TEMP_ID_FILES",
      priority: 60,
    }),
    ensureRecurringJob({
      type: "VERIFY_AUDIT_CHAIN",
      payload: {},
      idempotencyKey: "recurring:VERIFY_AUDIT_CHAIN",
      priority: 90,
    }),
  ]);

  log.info(
    {
      deadlineWatch: results[0]?.id,
      retentionSweep: results[1]?.id,
      purgeEvidence: results[2]?.id,
      purgeTempId: results[3]?.id,
      auditVerification: results[4]?.id,
    },
    "Recurring jobs ensured"
  );
}
