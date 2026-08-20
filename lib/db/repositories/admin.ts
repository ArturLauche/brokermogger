/**
 * Admin catalogue and operations persistence.
 *
 * Callers must already have passed `requirePermission` for the matching
 * admin action. These functions do not re-check ownership because brokers,
 * legal rules and jobs are instance resources.
 */
import type {
  AdminActionType,
  BrokerVerificationStatus,
  JobStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db/client";

export async function countAdminOverview() {
  const [unverifiedBrokers, unpublishedRuleDrafts, failedJobs, pendingManualReviews] =
    await Promise.all([
      prisma.broker.count({
        where: {
          deletedAt: null,
          verificationStatus: { in: ["UNVERIFIED", "SOURCE_FOUND"] },
        },
      }),
      prisma.legalRuleVersion.count({ where: { status: "DRAFT" } }),
      prisma.backgroundJob.count({ where: { status: "FAILED" } }),
      prisma.removalRequest.count({
        where: { status: "MANUAL_REVIEW_REQUIRED", deletedAt: null },
      }),
    ]);

  return { unverifiedBrokers, unpublishedRuleDrafts, failedJobs, pendingManualReviews };
}

export async function listAdminBrokers() {
  return prisma.broker.findMany({
    where: { deletedAt: null },
    include: { contactMethods: true },
    orderBy: { legalName: "asc" },
    take: 200,
  });
}

export async function updateBrokerAdmin(
  brokerId: string,
  data: {
    verificationStatus?: BrokerVerificationStatus;
    productionSendingEnabled?: boolean;
    notes?: string;
  }
) {
  return prisma.broker.update({
    where: { id: brokerId },
    data: {
      ...(data.verificationStatus !== undefined
        ? { verificationStatus: data.verificationStatus }
        : {}),
      ...(data.productionSendingEnabled !== undefined
        ? { productionSendingEnabled: data.productionSendingEnabled }
        : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  });
}

export async function listAdminLegalRules() {
  return prisma.legalRule.findMany({
    include: {
      jurisdiction: true,
      versions: { orderBy: { version: "desc" }, take: 3 },
    },
    orderBy: { lawName: "asc" },
  });
}

export async function listAdminTemplates() {
  return prisma.requestTemplate.findMany({
    where: { deletedAt: null },
    include: {
      jurisdiction: true,
      versions: { orderBy: { version: "desc" }, take: 2 },
    },
    orderBy: { name: "asc" },
  });
}

export async function listAdminJobs(status?: JobStatus) {
  return prisma.backgroundJob.findMany({
    where: status ? { status } : {},
    include: { logs: { orderBy: { createdAt: "desc" }, take: 5 } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getAdminJob(jobId: string) {
  return prisma.backgroundJob.findUnique({
    where: { id: jobId },
    include: { logs: { orderBy: { createdAt: "asc" } } },
  });
}

export async function listAdminAudit(limit = 100) {
  return prisma.auditLog.findMany({
    orderBy: { sequence: "desc" },
    take: limit,
  });
}

export async function createAdminAction(data: {
  adminUserId: string;
  type: AdminActionType;
  justification: string;
  targetUserId?: string;
  targetResourceType?: string;
  targetResourceId?: string;
  grantExpiresAt?: Date;
  auditLogId?: string;
}) {
  return prisma.adminAction.create({
    data: {
      adminUserId: data.adminUserId,
      type: data.type,
      justification: data.justification,
      targetUserId: data.targetUserId ?? null,
      targetResourceType: data.targetResourceType ?? null,
      targetResourceId: data.targetResourceId ?? null,
      grantExpiresAt: data.grantExpiresAt ?? null,
      auditLogId: data.auditLogId ?? null,
    },
  });
}

export async function findActiveGrantForAdmin(adminUserId: string) {
  return prisma.adminAction.findFirst({
    where: {
      adminUserId,
      type: "BREAK_GLASS_GRANT",
      revokedAt: null,
      grantExpiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listActiveBreakGlassGrants() {
  return prisma.adminAction.findMany({
    where: {
      type: "BREAK_GLASS_GRANT",
      revokedAt: null,
      grantExpiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeAdminAction(id: string) {
  return prisma.adminAction.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

export async function retryJobRow(jobId: string) {
  return prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "RETRYABLE",
      runAt: new Date(),
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      lockExpiresAt: null,
    },
  });
}

export type { Prisma };
