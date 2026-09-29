import { lockActiveAccount } from "./access";
/** Authorized catalogue and operations reads. Private job payloads are never listed. */
import { z } from "zod";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { entityIdSchema } from "@/lib/validation/ids";
import { parseWithSchema } from "@/lib/validation/form";
import type { JobStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { AppError } from "@/lib/core/errors";

export async function countAdminOverview(actor: ActorContext) {
  requirePermission(actor, "admin:console:access");
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

export async function listAdminLegalRules(actor: ActorContext) {
  requirePermission(actor, "admin:legalRule:read");
  return prisma.legalRule.findMany({
    include: {
      jurisdiction: true,
      versions: { orderBy: { version: "desc" }, take: 3 },
    },
    orderBy: { lawName: "asc" },
  });
}

export async function listAdminJobs(actor: ActorContext, status?: JobStatus) {
  requirePermission(actor, "admin:job:read");
  return prisma.backgroundJob.findMany({
    where: status ? { status } : {},
    select: {
      id: true,
      type: true,
      status: true,
      runAt: true,
      attemptCount: true,
      maxAttempts: true,
      lastError: true,
      relatedRequestId: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function listAdminAudit(actor: ActorContext, limit = 100) {
  requirePermission(actor, "admin:audit:read");
  parseWithSchema(z.number().int().min(1).max(250), limit);
  return prisma.auditLog.findMany({
    orderBy: { sequence: "desc" },
    take: limit,
  });
}

export async function createBreakGlassGrant(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:user:list");
  const command = parseWithSchema(
    z.object({
      targetUserId: entityIdSchema,
      justification: z.string().trim().min(20).max(2000),
      durationHours: z.number().int().min(1).max(24),
    }),
    raw
  );
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, actor.userId);
    if (
      !(await tx.user.findFirst({
        where: { id: command.targetUserId, deletedAt: null },
        select: { id: true },
      }))
    )
      throw new AppError({
        code: "NOT_FOUND",
        message: "This account is not available for emergency access.",
      });
    return tx.adminAction.create({
      data: {
        adminUserId: actor.userId,
        type: "BREAK_GLASS_GRANT",
        targetUserId: command.targetUserId,
        justification: command.justification,
        grantExpiresAt: new Date(Date.now() + command.durationHours * 3_600_000),
      },
    });
  });
}

export async function findActiveGrantForAdmin(actor: ActorContext) {
  requirePermission(actor, "admin:user:list");
  return prisma.adminAction.findFirst({
    where: {
      adminUserId: actor.userId,
      type: "BREAK_GLASS_GRANT",
      revokedAt: null,
      grantExpiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listActiveBreakGlassGrants(actor: ActorContext) {
  requirePermission(actor, "admin:audit:read");
  return prisma.adminAction.findMany({
    where: {
      type: "BREAK_GLASS_GRANT",
      revokedAt: null,
      grantExpiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeAdminAction(actor: ActorContext, id: string) {
  requirePermission(actor, "admin:user:list");
  parseWithSchema(entityIdSchema, id);
  return prisma.adminAction.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

export async function retryJobRow(actor: ActorContext, jobId: string) {
  requirePermission(actor, "admin:job:manage");
  parseWithSchema(entityIdSchema, jobId);
  const result = await prisma.backgroundJob.updateMany({
    where: { id: jobId, status: { in: ["FAILED", "RETRYABLE"] } },
    data: {
      status: "RETRYABLE",
      runAt: new Date(),
      attemptCount: 0,
      lastError: null,
      completedAt: null,
      cancelledAt: null,
      lockedAt: null,
      lockedBy: null,
      lockExpiresAt: null,
      leaseToken: null,
    },
  });
  if (result.count !== 1)
    throw new AppError({
      code: "CONFLICT",
      message: "Only failed or retryable jobs can be retried.",
    });
  return result;
}

export async function cancelJobRow(actor: ActorContext, jobId: string) {
  requirePermission(actor, "admin:job:manage");
  parseWithSchema(entityIdSchema, jobId);
  const result = await prisma.backgroundJob.updateMany({
    where: { id: jobId, status: { in: ["PENDING", "RETRYABLE", "RUNNING"] } },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      leaseToken: null,
      lockedAt: null,
      lockedBy: null,
      lockExpiresAt: null,
      lastError:
        "Cancelled by instance admin. A provider operation already started may still complete.",
    },
  });
  if (result.count !== 1)
    throw new AppError({
      code: "CONFLICT",
      message: "This job is no longer eligible for cancellation.",
    });
  return result;
}

export type { Prisma };
