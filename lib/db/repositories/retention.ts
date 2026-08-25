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
