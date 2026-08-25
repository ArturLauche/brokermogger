/**
 * Batch deletes used only by the retention sweep. Personal data is not logged.
 */
import { prisma, withAppendOnlyDeletes } from "@/lib/db/client";

export async function deleteJobLogsOlderThan(
  cutoff: Date,
  take: number
): Promise<number> {
  const rows = await prisma.backgroundJobLog.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
    take,
  });
  if (rows.length === 0) return 0;
  const result = await prisma.backgroundJobLog.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  });
  return result.count;
}

export async function countJobLogsOlderThan(cutoff: Date): Promise<number> {
  return prisma.backgroundJobLog.count({ where: { createdAt: { lt: cutoff } } });
}

export async function deleteNotificationsOlderThan(
  cutoff: Date,
  take: number
): Promise<number> {
  const rows = await prisma.notification.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
    take,
  });
  if (rows.length === 0) return 0;
  const result = await prisma.notification.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  });
  return result.count;
}

export async function countNotificationsOlderThan(cutoff: Date): Promise<number> {
  return prisma.notification.count({ where: { createdAt: { lt: cutoff } } });
}

export async function deleteOutboundEmailsOlderThan(
  cutoff: Date,
  take: number
): Promise<number> {
  const rows = await prisma.outboundEmail.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
    take,
  });
  if (rows.length === 0) return 0;
  const result = await prisma.outboundEmail.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  });
  return result.count;
}

export async function countOutboundEmailsOlderThan(cutoff: Date): Promise<number> {
  return prisma.outboundEmail.count({ where: { createdAt: { lt: cutoff } } });
}

export async function deleteProcessedWebhookEventsOlderThan(
  cutoff: Date,
  take: number
): Promise<number> {
  const rows = await prisma.emailWebhookEvent.findMany({
    where: { processedAt: { not: null, lt: cutoff } },
    select: { id: true },
    take,
  });
  if (rows.length === 0) return 0;
  const result = await prisma.emailWebhookEvent.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  });
  return result.count;
}

export async function countProcessedWebhookEventsOlderThan(
  cutoff: Date
): Promise<number> {
  return prisma.emailWebhookEvent.count({
    where: { processedAt: { not: null, lt: cutoff } },
  });
}

export async function deleteAuditLogsOlderThan(
  cutoff: Date,
  take: number
): Promise<number> {
  return withAppendOnlyDeletes(async (tx) => {
    const rows = await tx.auditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      orderBy: { sequence: "asc" },
      take,
    });
    if (rows.length === 0) return 0;
    const result = await tx.auditLog.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    return result.count;
  });
}

export async function countAuditLogsOlderThan(cutoff: Date): Promise<number> {
  return prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } });
}

export async function deleteConsentRecordsOlderThan(
  cutoff: Date,
  take: number
): Promise<number> {
  return withAppendOnlyDeletes(async (tx) => {
    const rows = await tx.consentRecord.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take,
    });
    if (rows.length === 0) return 0;
    const result = await tx.consentRecord.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    return result.count;
  });
}

export async function countConsentRecordsOlderThan(cutoff: Date): Promise<number> {
  return prisma.consentRecord.count({ where: { createdAt: { lt: cutoff } } });
}

/**
 * Removes snapshot bodies, lifecycle events and stored broker replies for
 * closed requests that have reached the retention window. Snapshots and
 * events are append-only; this must run inside the hatch.
 */
export async function deleteRequestHistoryForRetention(
  requestIds: readonly string[]
): Promise<{ snapshots: number; events: number; responses: number }> {
  if (requestIds.length === 0) {
    return { snapshots: 0, events: 0, responses: 0 };
  }
  const ids = [...requestIds];
  return withAppendOnlyDeletes(async (tx) => {
    const snapshots = await tx.requestSnapshot.deleteMany({
      where: { removalRequestId: { in: ids } },
    });
    const events = await tx.removalRequestEvent.deleteMany({
      where: { removalRequestId: { in: ids } },
    });
    const responses = await tx.brokerResponse.deleteMany({
      where: { removalRequestId: { in: ids } },
    });
    return {
      snapshots: snapshots.count,
      events: events.count,
      responses: responses.count,
    };
  });
}
