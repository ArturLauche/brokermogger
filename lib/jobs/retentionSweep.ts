/**
 * Retention sweep: apply the instance windows from system settings.
 *
 * Evidence files are purged through the existing storage-aware handlers.
 * Append-only tables are deleted only through `withAppendOnlyDeletes`.
 * A dry run counts candidates without writing.
 */
import { recordAudit } from "@/lib/audit/service";
import { getSetting } from "@/lib/config/runtimeSettings";
import {
  countExpiredTemporaryEvidence,
  countRetentionDueEvidence,
  listExpiredTemporaryEvidence,
  listRetentionDueEvidence,
  listUnfinishedFilePurges,
} from "@/lib/db/repositories/evidence";
import {
  countClosedRequestsDueForRetention,
  listClosedRequestsDueForRetention,
  softDeleteClosedRequests,
} from "@/lib/db/repositories/requests";
import {
  countAuditLogsOlderThan,
  countConsentRecordsOlderThan,
  countJobLogsOlderThan,
  countNotificationsOlderThan,
  countOutboundEmailsOlderThan,
  countProcessedWebhookEventsOlderThan,
  deleteAuditLogsOlderThan,
  deleteConsentRecordsOlderThan,
  deleteJobLogsOlderThan,
  deleteNotificationsOlderThan,
  deleteOutboundEmailsOlderThan,
  deleteProcessedWebhookEventsOlderThan,
  deleteRequestHistoryForRetention,
} from "@/lib/db/repositories/retention";
import { createLogger } from "@/lib/observability/logger";
import { systemActor } from "@/lib/permissions/actor";
import { countExpiredRateLimitBuckets, purgeExpiredBuckets } from "@/lib/rateLimit";
import { purgePrivateFile } from "@/lib/storage/privateFiles";
import { mapPool } from "@/lib/async/pool";

import { daysAgo, monthsAgo } from "./datetime";
import type { JobResult } from "./types";

const log = createLogger("jobs.retention");
const BATCH = 100;
const MAX_BATCHES = 20;

export async function runRetentionSweep(input: { dryRun: boolean }): Promise<JobResult> {
  const now = new Date();
  const [
    evidenceMonths,
    closedRequestMonths,
    auditMonths,
    consentMonths,
    jobLogDays,
    emailMonths,
    notificationMonths,
  ] = await Promise.all([
    getSetting("retentionEvidenceMonths"),
    getSetting("retentionClosedRequestMonths"),
    getSetting("retentionAuditLogMonths"),
    getSetting("retentionConsentRecordMonths"),
    getSetting("retentionJobLogDays"),
    getSetting("retentionEmailLogMonths"),
    getSetting("retentionNotificationMonths"),
  ]);

  const evidenceCutoff = monthsAgo(now, evidenceMonths);
  const closedCutoff = monthsAgo(now, closedRequestMonths);
  const auditCutoff = monthsAgo(now, auditMonths);
  const consentCutoff = monthsAgo(now, consentMonths);
  const jobLogCutoff = daysAgo(now, jobLogDays);
  const emailCutoff = monthsAgo(now, emailMonths);
  const notificationCutoff = monthsAgo(now, notificationMonths);

  const counts = {
    evidence: 0,
    temporaryIdentity: 0,
    closedRequests: 0,
    closedRequestSnapshots: 0,
    closedRequestEvents: 0,
    jobLogs: 0,
    notifications: 0,
    outboundEmail: 0,
    webhookEvents: 0,
    auditLogs: 0,
    consentRecords: 0,
    rateLimitBuckets: 0,
  };

  if (input.dryRun) {
    const [
      evidence,
      temporaryIdentity,
      closedRequests,
      jobLogs,
      notifications,
      outboundEmail,
      webhookEvents,
      auditLogs,
      consentRecords,
      rateLimitBuckets,
    ] = await Promise.all([
      countRetentionDueEvidence(evidenceCutoff),
      countExpiredTemporaryEvidence(),
      countClosedRequestsDueForRetention(closedCutoff),
      countJobLogsOlderThan(jobLogCutoff),
      countNotificationsOlderThan(notificationCutoff),
      countOutboundEmailsOlderThan(emailCutoff),
      countProcessedWebhookEventsOlderThan(emailCutoff),
      countAuditLogsOlderThan(auditCutoff),
      countConsentRecordsOlderThan(consentCutoff),
      countExpiredRateLimitBuckets(now),
    ]);
    Object.assign(counts, {
      evidence,
      temporaryIdentity,
      closedRequests,
      jobLogs,
      notifications,
      outboundEmail,
      webhookEvents,
      auditLogs,
      consentRecords,
      rateLimitBuckets,
    });
    log.info({ dryRun: true, ...counts }, "Retention dry run");
    return {
      message: "Retention dry run.",
      metadata: counts,
    };
  }

  const unfinished = await listUnfinishedFilePurges(BATCH);
  await mapPool(unfinished, 5, purgePrivateFile);
  counts.evidence = unfinished.length + (await purgeEvidenceBatch(evidenceCutoff));
  counts.temporaryIdentity = await purgeTemporaryIdentity();
  counts.closedRequests = await drain(
    () => listClosedRequestsDueForRetention(closedCutoff, BATCH),
    async (rows) => {
      const ids = rows.map((row) => row.id);
      const history = await deleteRequestHistoryForRetention(ids);
      counts.closedRequestSnapshots += history.snapshots;
      counts.closedRequestEvents += history.events;
      return softDeleteClosedRequests(ids);
    }
  );
  counts.jobLogs = await drainCount((take) => deleteJobLogsOlderThan(jobLogCutoff, take));
  counts.notifications = await drainCount((take) =>
    deleteNotificationsOlderThan(notificationCutoff, take)
  );
  counts.outboundEmail = await drainCount((take) =>
    deleteOutboundEmailsOlderThan(emailCutoff, take)
  );
  counts.webhookEvents = await drainCount((take) =>
    deleteProcessedWebhookEventsOlderThan(emailCutoff, take)
  );
  counts.auditLogs = await drainCount((take) =>
    deleteAuditLogsOlderThan(auditCutoff, take)
  );
  counts.consentRecords = await drainCount((take) =>
    deleteConsentRecordsOlderThan(consentCutoff, take)
  );
  counts.rateLimitBuckets = await purgeExpiredBuckets(now);

  await recordAudit({
    actor: systemActor("retention-sweep"),
    action: "system.retention_sweep",
    resourceType: "instance",
    metadata: counts,
  });

  log.info(counts, "Retention sweep complete");
  return { message: "Retention sweep complete.", metadata: counts };
}

async function purgeEvidenceBatch(cutoff: Date): Promise<number> {
  let purged = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const files = await listRetentionDueEvidence(cutoff, BATCH);
    if (files.length === 0) break;
    await mapPool(files, 5, async (file) => {
      await purgePrivateFile(file);
    });
    purged += files.length;
  }
  return purged;
}

async function purgeTemporaryIdentity(): Promise<number> {
  let purged = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const files = await listExpiredTemporaryEvidence(BATCH);
    if (files.length === 0) break;
    await mapPool(files, 5, async (file) => {
      await purgePrivateFile(file);
    });
    purged += files.length;
  }
  return purged;
}

async function drain<T>(
  load: () => Promise<T[]>,
  apply: (rows: T[]) => Promise<number>
): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const rows = await load();
    if (rows.length === 0) break;
    total += await apply(rows);
  }
  return total;
}

async function drainCount(apply: (take: number) => Promise<number>): Promise<number> {
  let total = 0;
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const removed = await apply(BATCH);
    total += removed;
    if (removed < BATCH) break;
  }
  return total;
}
