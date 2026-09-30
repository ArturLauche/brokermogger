import { lockAuthorizedAccount } from "./access";
/** Authorized catalogue and operations reads. Private job payloads are never listed. */
import { z } from "zod";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { entityIdSchema } from "@/lib/validation/ids";
import { parseWithSchema } from "@/lib/validation/form";
import { JobStatus, JobType, type Prisma } from "@prisma/client";
import { pageInputSchema, createdBeforeCursor, cursorPage } from "@/lib/pagination";

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

const jobListSchema = pageInputSchema.extend({
  status: z.union([z.literal("all"), z.enum(JobStatus)]).default("all"),
  type: z.union([z.literal("all"), z.enum(JobType)]).default("all"),
  search: z.string().trim().max(100).default(""),
});
export async function listAdminJobs(actor: ActorContext, raw: unknown = {}) {
  requirePermission(actor, "admin:job:read");
  const input = parseWithSchema(jobListSchema, raw);
  const where: Prisma.BackgroundJobWhereInput = {
    ...(input.status !== "all" ? { status: input.status } : {}),
    ...(input.type !== "all" ? { type: input.type } : {}),
    ...(input.search
      ? {
          OR: [
            { id: { contains: input.search, mode: "insensitive" } },
            { relatedRequestId: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.backgroundJob.findMany({
      where: { AND: [where, createdBeforeCursor(input.cursor)] },
      select: {
        id: true,
        createdAt: true,
        type: true,
        status: true,
        runAt: true,
        attemptCount: true,
        maxAttempts: true,
        lastError: true,
        relatedRequestId: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    }),
    prisma.backgroundJob.count({ where }),
  ]);
  return { ...cursorPage(rows, input.limit), total };
}

const auditListSchema = pageInputSchema.extend({
  search: z.string().trim().max(100).default(""),
  outcome: z.enum(["all", "SUCCESS", "ERROR", "DENIED"]).default("all"),
});
function beforeAuditSequence(cursor: string | undefined): Prisma.AuditLogWhereInput {
  if (!cursor) return {};
  let sequence: string;
  try {
    sequence = z
      .string()
      .regex(/^[1-9]\d{0,18}$/)
      .parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")).sequence);
  } catch {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "This audit page link is invalid. Open the first page and try again.",
    });
  }
  if (BigInt(sequence) > 9223372036854775807n)
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "This audit page link is invalid.",
    });
  return { sequence: { lt: BigInt(sequence) } };
}
export async function listAdminAudit(actor: ActorContext, raw: unknown = {}) {
  requirePermission(actor, "admin:audit:read");
  const input = parseWithSchema(auditListSchema, raw);
  const where: Prisma.AuditLogWhereInput = {
    ...(input.outcome !== "all" ? { outcome: input.outcome } : {}),
    ...(input.search
      ? {
          OR: [
            { action: { contains: input.search, mode: "insensitive" } },
            { resourceType: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { AND: [where, beforeAuditSequence(input.cursor)] },
      select: {
        id: true,
        sequence: true,
        createdAt: true,
        action: true,
        resourceType: true,
        resourceId: true,
        outcome: true,
      },
      orderBy: { sequence: "desc" },
      take: input.limit + 1,
    }),
    prisma.auditLog.count({ where }),
  ]);
  const items = rows.slice(0, input.limit);
  const last = items.at(-1);
  return {
    items,
    total,
    nextCursor:
      rows.length > input.limit && last
        ? Buffer.from(JSON.stringify({ sequence: last.sequence.toString() })).toString(
            "base64url"
          )
        : null,
  };
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
    await lockAuthorizedAccount(tx, actor, "admin:user:list");
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
  return prisma.$transaction(async (tx) => {
    await lockAuthorizedAccount(tx, actor, "admin:user:list");
    return tx.adminAction.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  });
}

export async function retryJobRow(actor: ActorContext, jobId: string) {
  requirePermission(actor, "admin:job:manage");
  parseWithSchema(entityIdSchema, jobId);
  return prisma.$transaction(async (tx) => {
    if (!actor.isSystem) await lockAuthorizedAccount(tx, actor, "admin:job:manage");
    const result = await tx.backgroundJob.updateMany({
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
  });
}

export async function cancelJobRow(actor: ActorContext, jobId: string) {
  requirePermission(actor, "admin:job:manage");
  parseWithSchema(entityIdSchema, jobId);
  return prisma.$transaction(async (tx) => {
    if (!actor.isSystem) await lockAuthorizedAccount(tx, actor, "admin:job:manage");
    const result = await tx.backgroundJob.updateMany({
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
  });
}

export type { Prisma };
