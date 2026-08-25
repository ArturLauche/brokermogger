/**
 * Ownership-scoped privacy reports.
 */
import type { Prisma, ReportFormat, ReportStatus } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";

export async function listOwnedReports(actor: ActorContext, profileId: string | null) {
  requirePermission(actor, "report:read", { ownerUserId: actor.userId });
  return prisma.report.findMany({
    where: {
      userId: actor.userId,
      deletedAt: null,
      ...(profileId ? { profileId } : {}),
    },
    include: { evidenceFile: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getOwnedReport(actor: ActorContext, reportId: string) {
  const report = await prisma.report.findFirst({
    where: { id: reportId, deletedAt: null },
    include: { evidenceFile: true, profile: true },
  });
  if (!report) {
    throw new NotFoundError("This report does not exist.");
  }
  requirePermission(actor, "report:read", { ownerUserId: report.userId });
  return report;
}

/** Worker report generation: load by id without expanding the Prisma client into domain services. */
export async function getReportById(reportId: string) {
  return prisma.report.findUnique({
    where: { id: reportId },
    include: { profile: true },
  });
}

export async function createReport(data: Prisma.ReportCreateInput) {
  return prisma.report.create({ data });
}

export async function updateReport(reportId: string, data: Prisma.ReportUpdateInput) {
  return prisma.report.update({ where: { id: reportId }, data });
}

export type { ReportFormat, ReportStatus };
