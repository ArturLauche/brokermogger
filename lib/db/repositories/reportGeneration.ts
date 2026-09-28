/** Fenced report generation. Every page and publication checks the owning account. */
import type { Prisma, Report } from "@prisma/client";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import type { ClaimedJob } from "@/lib/jobs/types";
import { AppError } from "@/lib/core/errors";
import { lockJobLeaseInTx } from "./jobLease";
import { createNotificationInTx } from "./notifications";

type ReportJob = ClaimedJob<"GENERATE_REPORT">;

async function currentReport(tx: PrismaTransaction, job: ReportJob) {
  const ref = await tx.report.findFirst({
    where: { id: job.payload.reportId, deletedAt: null },
    select: { userId: true },
  });
  if (!ref) return null;
  await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ref.userId} FOR UPDATE`;
  if (
    !(await lockJobLeaseInTx(tx, job, "GENERATE_REPORT", {
      reportId: job.payload.reportId,
    }))
  )
    return null;
  if (
    !(await tx.user.findFirst({
      where: {
        id: ref.userId,
        status: "ACTIVE",
        deletedAt: null,
        deletionRequestedAt: null,
      },
      select: { id: true },
    }))
  )
    return null;
  return tx.report.findFirst({
    where: { id: job.payload.reportId, deletedAt: null, jobId: job.id },
  });
}
function sourceWhere(report: Report): Prisma.RemovalRequestWhereInput {
  return {
    userId: report.userId,
    deletedAt: null,
    profile: { ownerUserId: report.userId, deletedAt: null },
    ...(report.profileId ? { profileId: report.profileId } : {}),
    createdAt: {
      gte: report.rangeStartAt,
      lt: report.rangeEndAt,
      lte: report.sourceCutoffAt!,
    },
  };
}
export async function beginReportGeneration(job: ReportJob) {
  return prisma.$transaction(async (tx) => {
    const report = await currentReport(tx, job);
    if (
      !report ||
      report.status === "READY" ||
      (report.status === "GENERATING" && report.generationLeaseToken === job.leaseToken)
    )
      return null;
    if (
      report.profileId &&
      !(await tx.userProfile.findFirst({
        where: { id: report.profileId, ownerUserId: report.userId, deletedAt: null },
        select: { id: true },
      }))
    )
      return null;
    const sourceCutoffAt = new Date();
    const totalRequests = await tx.removalRequest.count({
      where: sourceWhere({ ...report, sourceCutoffAt }),
    });
    const started = await tx.report.update({
      where: { id: report.id },
      data: {
        status: "GENERATING",
        generationLeaseToken: job.leaseToken,
        sourceCutoffAt,
        totalRequests,
        processedRequests: 0,
        error: null,
      },
    });
    const profile = report.profileId
      ? await tx.userProfile.findUnique({
          where: { id: report.profileId },
          select: { displayName: true },
        })
      : null;
    return { ...started, profileLabel: profile?.displayName ?? "All profiles" };
  });
}
export async function loadReportPage(job: ReportJob, cursor?: string) {
  return prisma.$transaction(async (tx) => {
    const report = await currentReport(tx, job);
    if (
      !report ||
      report.status !== "GENERATING" ||
      report.generationLeaseToken !== job.leaseToken
    )
      return null;
    const rows = await tx.removalRequest.findMany({
      where: { ...sourceWhere(report), ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: 250,
      select: {
        id: true,
        requestType: true,
        status: true,
        legalBasisText: true,
        deadlineAt: true,
        sentAt: true,
        createdAt: true,
        broker: { select: { legalName: true } },
        manualSubmissions: {
          orderBy: { submittedOn: "asc" },
          take: 1,
          select: { submittedOn: true },
        },
        outboundEmails: {
          where: {
            dispatchState: "ACCEPTED",
            provider: "RESEND",
            sentAt: { not: null },
          },
          take: 1,
          orderBy: { sentAt: "asc" },
          select: { sentAt: true },
        },
      },
    });
    await tx.report.update({
      where: { id: report.id },
      data: { processedRequests: { increment: rows.length } },
    });
    return rows;
  });
}

export async function publishReportFile(
  job: ReportJob,
  fileId: string,
  summary: { requests: number; brokers: number; openActions: number }
) {
  return prisma.$transaction(async (tx) => {
    const report = await currentReport(tx, job);
    if (
      !report ||
      report.status !== "GENERATING" ||
      report.generationLeaseToken !== job.leaseToken
    )
      return false;
    const file = await tx.evidenceFile.findFirst({
      where: {
        id: fileId,
        userId: report.userId,
        profileId: report.profileId,
        kind: "REPORT",
        storageState: "UPLOADING",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!file)
      throw new AppError({
        code: "STORAGE_FAILED",
        message: "The generated report is no longer available. Try again.",
      });
    await tx.evidenceFile.update({
      where: { id: file.id },
      data: { storageState: "READY" },
    });
    await tx.report.update({
      where: { id: report.id },
      data: {
        status: "READY",
        evidenceFileId: file.id,
        generatedAt: new Date(),
        summary,
        processedRequests: summary.requests,
        totalRequests: summary.requests,
        generationLeaseToken: null,
        error: null,
      },
    });
    await createNotificationInTx(tx, {
      userId: report.userId,
      profileId: report.profileId,
      type: "REPORT_READY",
      title: "Your report is ready",
      body: "Download your privacy request summary from Reports.",
      actionUrl: "/reports",
      dedupeKey: `report-ready:${file.id}`,
    });
    return true;
  });
}

export async function failReportGeneration(job: ReportJob) {
  return prisma.$transaction(async (tx) => {
    const report = await currentReport(tx, job);
    if (
      !report ||
      report.status === "READY" ||
      report.generationLeaseToken !== job.leaseToken
    )
      return;
    await tx.report.update({
      where: { id: report.id },
      data: {
        status: "FAILED",
        generationLeaseToken: null,
        error:
          "Report generation could not finish. Check storage and worker availability, then retry.",
      },
    });
  });
}

/** A publication timeout may have committed. Never purge a successfully linked file. */
export async function abandonUnpublishedReportFile(fileId: string) {
  return prisma.$transaction(async (tx) => {
    const ref = await tx.evidenceFile.findUnique({
      where: { id: fileId },
      select: { userId: true },
    });
    if (!ref) return null;
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ref.userId} FOR UPDATE`;
    if (
      await tx.report.findFirst({
        where: { evidenceFileId: fileId },
        select: { id: true },
      })
    )
      return null;
    const file = await tx.evidenceFile.findFirst({
      where: { id: fileId, storageState: { not: "PURGED" } },
    });
    if (!file) return null;
    return tx.evidenceFile.update({
      where: { id: fileId },
      data: {
        storageState: "PURGE_PENDING",
        deletedAt: new Date(),
        purgeRequestedAt: new Date(),
      },
    });
  });
}
