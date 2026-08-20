/**
 * Instance-wide operational counters. No personal data.
 */
import { prisma } from "@/lib/db/client";

export async function readOperationalMetrics() {
  const [jobsPending, jobsFailed, requestsOpen, users] = await Promise.all([
    prisma.backgroundJob.count({
      where: { status: { in: ["PENDING", "RETRYABLE", "RUNNING"] } },
    }),
    prisma.backgroundJob.count({ where: { status: "FAILED" } }),
    prisma.removalRequest.count({
      where: { deletedAt: null, status: { notIn: ["CLOSED", "COMPLETED"] } },
    }),
    prisma.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
  ]);
  return { jobsPending, jobsFailed, requestsOpen, users };
}
