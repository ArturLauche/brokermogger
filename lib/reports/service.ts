/**
 * Report generation. PDF rendering uses pdfkit.
 */
import { PassThrough } from "node:stream";

import PDFDocument from "pdfkit";
import { addMonths } from "date-fns";

import { recordAudit } from "@/lib/audit/service";
import { ValidationError } from "@/lib/core/errors";
import { createEvidenceFile } from "@/lib/db/repositories/evidence";
import {
  createReport,
  getOwnedReport,
  getReportById,
  listOwnedReports,
  updateReport,
} from "@/lib/db/repositories/reports";
import { listRequestsForUser } from "@/lib/db/repositories/requests";
import { enqueueJob } from "@/lib/jobs/queue";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { getStorage } from "@/lib/storage";
import { sha256Hex } from "@/lib/security/crypto";
import type { ReportFormat } from "@prisma/client";

import { buildReportPayload, reportToJson, type ReportPayload } from "./build";

export async function requestReport(
  actor: ActorContext,
  input: { profileId: string | null; dateFrom: Date; dateTo: Date; format: ReportFormat }
) {
  requirePermission(actor, "report:generate", { ownerUserId: actor.userId });
  if (input.dateTo.getTime() < input.dateFrom.getTime()) {
    throw new ValidationError("The end date must be on or after the start date.");
  }
  if (input.dateTo.getTime() > addMonths(input.dateFrom, 24).getTime()) {
    throw new ValidationError("The date range cannot exceed 24 months.");
  }

  const report = await createReport({
    user: { connect: { id: actor.userId } },
    ...(input.profileId ? { profile: { connect: { id: input.profileId } } } : {}),
    title: "Privacy request report",
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    format: input.format,
    status: "PENDING",
  });

  await enqueueJob({
    type: "GENERATE_REPORT",
    payload: { reportId: report.id },
    idempotencyKey: `report:${report.id}`,
    relatedUserId: actor.userId,
  });

  await recordAudit({
    actor,
    action: "report.generated",
    resourceType: "report",
    resourceId: report.id,
  });

  return report;
}

export async function listReports(actor: ActorContext, profileId: string | null) {
  return listOwnedReports(actor, profileId);
}

export async function markReportDownloaded(actor: ActorContext, reportId: string) {
  const report = await getOwnedReport(actor, reportId);
  await recordAudit({
    actor,
    action: "report.downloaded",
    resourceType: "report",
    resourceId: report.id,
  });
  return report;
}

export async function renderReportForJob(reportId: string): Promise<{ message: string }> {
  const report = await getReportById(reportId);
  if (!report) {
    return { message: "Report no longer exists." };
  }
  if (report.status === "READY" && report.evidenceFileId) {
    return { message: "Report already generated." };
  }

  await updateReport(reportId, { status: "GENERATING" });

  const inRange = await listRequestsForUser(report.userId, report.profileId, {
    from: report.dateFrom,
    to: report.dateTo,
  });

  const payload = buildReportPayload({
    dateFrom: report.dateFrom,
    dateTo: report.dateTo,
    profileLabel: report.profile?.displayName ?? "All profiles",
    requests: inRange.map((row) => ({
      id: row.id,
      brokerName: row.broker.legalName,
      requestType: row.requestType,
      status: row.status,
      legalBasis: row.legalBasisText,
      deadlineAt: row.deadlineAt ? row.deadlineAt.toISOString().slice(0, 10) : null,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    })),
  });

  const body = report.format === "PDF" ? await renderPdf(payload) : reportToJson(payload);
  const contentType = report.format === "PDF" ? "application/pdf" : "application/json";
  const key = `reports/${report.userId}/${report.id}.${report.format === "PDF" ? "pdf" : "json"}`;
  const stored = await getStorage().put({ key, body, contentType });

  const evidence = await createEvidenceFile({
    user: { connect: { id: report.userId } },
    ...(report.profileId ? { profile: { connect: { id: report.profileId } } } : {}),
    kind: "REPORT",
    storageKey: stored.key,
    storageBackend: getStorage().backend,
    contentType,
    byteSize: stored.byteSize,
    checksumSha256: stored.checksumSha256 || sha256Hex(body),
    filenameMasked: `report.${report.format === "PDF" ? "pdf" : "json"}`,
  });

  await updateReport(reportId, {
    status: "READY",
    generatedAt: new Date(),
    evidenceFile: { connect: { id: evidence.id } },
    summary: {
      brokers: payload.brokersContacted.length,
      requests: payload.requests.length,
      openActions: payload.openActions.length,
    },
  });

  return { message: "Report ready." };
}

async function renderPdf(payload: ReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    doc.pipe(stream);

    doc.fontSize(16).text(payload.title);
    doc.moveDown();
    doc.fontSize(11).text(`Generated: ${payload.generatedAt}`);
    doc.text(`Range: ${payload.dateFrom} to ${payload.dateTo}`);
    doc.text(`Profile: ${payload.profileLabel}`);
    doc.moveDown();
    doc.fontSize(13).text("Brokers contacted");
    doc.fontSize(11).text(payload.brokersContacted.join(", ") || "None");
    doc.moveDown();
    doc.fontSize(13).text("Requests");
    for (const row of payload.requests) {
      doc
        .fontSize(11)
        .text(
          `${row.brokerName} — ${row.requestType.toLowerCase().replaceAll("_", " ")} — ${row.status}`
        );
      if (row.legalBasis) {
        doc.fontSize(9).text(row.legalBasis, { indent: 12 });
      }
    }
    doc.moveDown();
    doc.fontSize(13).text("Limitations");
    for (const line of payload.limitations) {
      doc.fontSize(11).text(`• ${line}`);
    }
    doc.moveDown();
    doc.fontSize(13).text("Suggested next steps");
    for (const line of payload.nextSteps) {
      doc.fontSize(11).text(`• ${line}`);
    }
    doc.end();
  });
}
