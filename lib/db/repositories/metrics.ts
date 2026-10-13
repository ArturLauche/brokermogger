/**
 * Instance-wide operational counters. No personal data.
 */
import { prisma } from "@/lib/db/client";
import { WORKER_HEARTBEAT_MAX_AGE_MS } from "./workers";

export async function readOperationalMetrics() {
  const now = new Date();
  const [
    jobs,
    requestsOpen,
    users,
    workers,
    ambiguousDeliveries,
    ambiguousNotifications,
    deletions,
    filesPendingPurge,
    unknownNetworkAuthAttempts24h,
  ] = await Promise.all([
    prisma.$queryRaw<
      {
        pending: bigint;
        failed: bigint;
        due: bigint;
        oldestDue: Date | null;
        expiredLeases: bigint;
      }[]
    >`
      SELECT COUNT(*) FILTER (WHERE status IN ('PENDING', 'RETRYABLE', 'RUNNING')) AS pending,
        COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
        COUNT(*) FILTER (WHERE status IN ('PENDING', 'RETRYABLE') AND "runAt" <= ${now}) AS due,
        MIN("runAt") FILTER (WHERE status IN ('PENDING', 'RETRYABLE') AND "runAt" <= ${now}) AS "oldestDue",
        COUNT(*) FILTER (WHERE status = 'RUNNING' AND "lockExpiresAt" <= ${now}) AS "expiredLeases"
      FROM "BackgroundJob"
    `,
    prisma.removalRequest.count({
      where: { deletedAt: null, status: { notIn: ["CLOSED", "COMPLETED"] } },
    }),
    prisma.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.$queryRaw<{ active: bigint; lastSeen: Date | null }[]>`
      SELECT COUNT(*) FILTER (WHERE "stoppedAt" IS NULL AND "lastSeenAt" >= ${new Date(now.getTime() - WORKER_HEARTBEAT_MAX_AGE_MS)}) AS active,
        MAX("lastSeenAt") AS "lastSeen" FROM "WorkerHeartbeat"
    `,
    prisma.outboundEmail.count({
      where: {
        purpose: { in: ["BROKER_REQUEST", "BROKER_FOLLOW_UP"] },
        dispatchState: { in: ["AMBIGUOUS", "RECONCILIATION_REQUIRED"] },
      },
    }),
    prisma.notification.count({
      where: { emailDispatchState: { in: ["AMBIGUOUS", "RECONCILIATION_REQUIRED"] } },
    }),
    prisma.user.aggregate({
      where: { deletionRequestedAt: { not: null }, anonymizedAt: null },
      _count: { id: true },
      _min: { deletionRequestedAt: true },
    }),
    prisma.evidenceFile.count({ where: { storageState: "PURGE_PENDING" } }),
    prisma.auditLog.count({
      where: {
        action: { in: ["auth.magic_link.requested", "auth.magic_link.rate_limited"] },
        ipHash: null,
        createdAt: { gte: new Date(now.getTime() - 86_400_000) },
      },
    }),
  ]);
  const ageSeconds = (date: Date | null) =>
    date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000)) : 0;
  return {
    jobsPending: Number(jobs[0]!.pending),
    jobsFailed: Number(jobs[0]!.failed),
    jobsDue: Number(jobs[0]!.due),
    oldestDueAgeSeconds: ageSeconds(jobs[0]!.oldestDue),
    expiredJobLeases: Number(jobs[0]!.expiredLeases),
    requestsOpen,
    users,
    workersActive: Number(workers[0]!.active),
    workerLastSeenAt: workers[0]!.lastSeen,
    ambiguousDeliveries,
    ambiguousNotifications,
    deletionBacklog: deletions._count.id,
    oldestDeletionAgeSeconds: ageSeconds(deletions._min.deletionRequestedAt),
    filesPendingPurge,
    unknownNetworkAuthAttempts24h,
  };
}
