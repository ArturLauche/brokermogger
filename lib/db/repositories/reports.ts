/** Ownership-scoped report commands and stable, narrow list results. */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { AppError, NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { createdBeforeCursor, cursorPage, pageInputSchema } from "@/lib/pagination";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { reportDateRange, reportInputSchema } from "@/lib/reports/validation";
import { parseJobPayload } from "@/lib/jobs/payloads";
import { lockActiveAccount } from "./access";

const reportSelect = {
  id: true,
  userId: true,
  profileId: true,
  dateFrom: true,
  dateTo: true,
  format: true,
  status: true,
  timeZone: true,
  generatedAt: true,
  sourceCutoffAt: true,
  createdAt: true,
  processedRequests: true,
  totalRequests: true,
  error: true,
  profile: { select: { displayName: true } },
  evidenceFile: {
    select: { id: true, storageState: true, deletedAt: true, expiresAt: true },
  },
  job: { select: { status: true, runAt: true, attemptCount: true, maxAttempts: true } },
} satisfies Prisma.ReportSelect;
const listSchema = pageInputSchema.extend({
  profileId: entityIdSchema.nullable().default(null),
  filter: z.enum(["all", "working", "ready", "failed"]).default("all"),
});
const activeOwner = {
  status: "ACTIVE" as const,
  deletionRequestedAt: null,
  deletedAt: null,
};

export async function listOwnedReports(actor: ActorContext, raw: unknown = {}) {
  requirePermission(actor, "report:read", { ownerUserId: actor.userId });
  const input = parseWithSchema(listSchema, raw);
  const filter: Prisma.ReportWhereInput =
    input.filter === "working"
      ? {
          status: { not: "READY" },
          job: { status: { in: ["PENDING", "RUNNING", "RETRYABLE"] } },
        }
      : input.filter === "ready"
        ? { status: "READY" }
        : input.filter === "failed"
          ? {
              OR: [
                { status: "FAILED" },
                { job: { status: { in: ["FAILED", "CANCELLED"] } } },
              ],
            }
          : {};
  const rows = await prisma.report.findMany({
    where: {
      userId: actor.userId,
      deletedAt: null,
      user: activeOwner,
      ...(input.profileId ? { profileId: input.profileId } : {}),
      AND: [filter, createdBeforeCursor(input.cursor)],
    },
    select: reportSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
  return cursorPage(rows, input.limit);
}

export async function getOwnedReport(actor: ActorContext, rawId: unknown) {
  requirePermission(actor, "report:read", { ownerUserId: actor.userId });
  const id = parseWithSchema(entityIdSchema, rawId);
  const report = await prisma.report.findFirst({
    where: { id, userId: actor.userId, deletedAt: null, user: activeOwner },
    select: reportSelect,
  });
  if (!report) throw new NotFoundError("This report does not exist.");
  return report;
}

export async function createOwnedReport(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "report:generate", { ownerUserId: actor.userId });
  const input = parseWithSchema(reportInputSchema, raw);
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, actor.userId);
    const submissionKey = `${actor.userId}:${input.submissionKey}`;
    const existing = await tx.report.findUnique({ where: { submissionKey } });
    if (existing) {
      if (
        existing.profileId !== input.profileId ||
        existing.format !== input.format ||
        existing.dateFrom.toISOString().slice(0, 10) !== input.dateFrom ||
        existing.dateTo.toISOString().slice(0, 10) !== input.dateTo
      )
        throw new AppError({
          code: "CONFLICT",
          message:
            "This form already queued a different report. Refresh to generate another.",
        });
      return { id: existing.id };
    }
    if (input.profileId) {
      const profile = await tx.userProfile.findFirst({
        where: { id: input.profileId, deletedAt: null },
        select: { ownerUserId: true },
      });
      if (!profile) throw new NotFoundError("This profile does not exist.");
      requirePermission(actor, "report:generate", { ownerUserId: profile.ownerUserId });
    }
    const { timezone: timeZone } = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { timezone: true },
    });
    const range = reportDateRange(input.dateFrom, input.dateTo, timeZone);
    const report = await tx.report.create({
      data: {
        id: randomUUID(),
        userId: actor.userId,
        profileId: input.profileId,
        dateFrom: new Date(`${input.dateFrom}T00:00:00Z`),
        dateTo: new Date(`${input.dateTo}T00:00:00Z`),
        ...range,
        timeZone,
        format: input.format,
        title: "Privacy request report",
        submissionKey,
      },
      select: { id: true },
    });
    const job = await tx.backgroundJob.create({
      data: {
        type: "GENERATE_REPORT",
        payloadJson: parseJobPayload("GENERATE_REPORT", { reportId: report.id }),
        relatedUserId: actor.userId,
        idempotencyKey: `report:${report.id}`,
      },
      select: { id: true },
    });
    await tx.report.update({ where: { id: report.id }, data: { jobId: job.id } });
    return report;
  });
}

export async function updateOwnedReportJob(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(
    z.object({ id: entityIdSchema, operation: z.enum(["retry", "cancel"]) }),
    raw
  );
  const ref = await prisma.report.findFirst({
    where: { id: input.id, deletedAt: null },
    select: { userId: true },
  });
  if (!ref) throw new NotFoundError("This report does not exist.");
  requirePermission(actor, "report:generate", { ownerUserId: ref.userId });
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, ref.userId);
    const report = await tx.report.findUniqueOrThrow({
      where: { id: input.id },
      include: { job: true, evidenceFile: true },
    });
    if (report.jobId)
      await tx.$executeRaw`SELECT 1 FROM "BackgroundJob" WHERE id = ${report.jobId} FOR UPDATE`;
    // Reload after the job lock: completion/cancellation can change independently.
    const job = report.jobId
      ? await tx.backgroundJob.findUnique({ where: { id: report.jobId } })
      : null;
    const available =
      report.status === "READY" &&
      report.evidenceFile?.storageState === "READY" &&
      !report.evidenceFile.deletedAt &&
      (!report.evidenceFile.expiresAt || report.evidenceFile.expiresAt > new Date());
    if (input.operation === "cancel") {
      if (available)
        throw new AppError({
          code: "CONFLICT",
          message: "This report has already finished.",
        });
      if (job && ["PENDING", "RETRYABLE", "RUNNING"].includes(job.status))
        await tx.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            leaseToken: null,
            lockedBy: null,
            lockedAt: null,
            lockExpiresAt: null,
          },
        });
      await tx.report.update({
        where: { id: report.id },
        data: {
          status: "FAILED",
          generationLeaseToken: null,
          error: "Report generation was cancelled.",
        },
      });
      return;
    }
    if (available) return;
    if (job && ["PENDING", "RETRYABLE", "RUNNING"].includes(job.status)) return;
    const queued = await tx.backgroundJob.upsert({
      where: { idempotencyKey: `report:${report.id}` },
      create: {
        type: "GENERATE_REPORT",
        relatedUserId: ref.userId,
        idempotencyKey: `report:${report.id}`,
        payloadJson: parseJobPayload("GENERATE_REPORT", { reportId: report.id }),
      },
      update: {
        status: "PENDING",
        attemptCount: 0,
        runAt: new Date(),
        completedAt: null,
        cancelledAt: null,
        lastError: null,
        leaseToken: null,
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
      },
      select: { id: true },
    });
    await tx.report.update({
      where: { id: report.id },
      data: {
        jobId: queued.id,
        status: "PENDING",
        generationLeaseToken: null,
        sourceCutoffAt: null,
        processedRequests: 0,
        totalRequests: 0,
        error: null,
        evidenceFileId: null,
      },
    });
  });
}
