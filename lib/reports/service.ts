/** Report orchestration; all persistence and worker fencing lives in repositories. */
import { PassThrough } from "node:stream";
import PDFDocument from "pdfkit";
import { recordAudit } from "@/lib/audit/service";
import {
  createOwnedReport,
  getOwnedReport,
  listOwnedReports,
  updateOwnedReportJob,
} from "@/lib/db/repositories/reports";
import {
  abandonUnpublishedReportFile,
  beginReportGeneration,
  failReportGeneration,
  loadReportPage,
  publishReportFile,
} from "@/lib/db/repositories/reportGeneration";
import { downloadEvidence } from "@/lib/evidence/service";
import { NotFoundError } from "@/lib/core/errors";
import type { ClaimedJob } from "@/lib/jobs/types";
import { parseJobPayload } from "@/lib/jobs/payloads";
import { requirePermission } from "@/lib/permissions/policy";
import { systemActor, type ActorContext } from "@/lib/permissions/actor";
import { purgePrivateFile, storePrivateFile } from "@/lib/storage/privateFiles";
import {
  buildReportPayload,
  reportToJson,
  type ReportPayload,
  type ReportRequestRow,
} from "./build";

export async function requestReport(actor: ActorContext, input: unknown) {
  const report = await createOwnedReport(actor, input);
  await recordAudit({
    actor,
    action: "report.requested",
    resourceType: "report",
    resourceId: report.id,
  });
  return report;
}
export async function listReports(actor: ActorContext, input: unknown = {}) {
  return listOwnedReports(actor, input);
}
export async function changeReportJob(
  actor: ActorContext,
  input: { id: string; operation: "retry" | "cancel" }
) {
  await updateOwnedReportJob(actor, input);
  await recordAudit({
    actor,
    action: input.operation === "retry" ? "report.retried" : "report.cancelled",
    resourceType: "report",
    resourceId: input.id,
  });
}
export async function downloadReport(actor: ActorContext, id: string) {
  const report = await getOwnedReport(actor, id);
  requirePermission(actor, "evidence:download", { ownerUserId: report.userId });
  if (report.status !== "READY" || !report.evidenceFile)
    throw new NotFoundError("This report is not ready to download.");
  const { body } = await downloadEvidence(actor, report.evidenceFile.id);
  await recordAudit({
    actor,
    action: "report.downloaded",
    resourceType: "report",
    resourceId: report.id,
  });
  return {
    body,
    format: report.format,
    filename: `brokermogger-report-${report.dateFrom.toISOString().slice(0, 10)}-${report.dateTo.toISOString().slice(0, 10)}.${report.format.toLowerCase()}`,
  };
}

export async function renderReportForJob(
  job: ClaimedJob<"GENERATE_REPORT">
): Promise<{ message: string }> {
  parseJobPayload("GENERATE_REPORT", job.payload);
  const report = await beginReportGeneration(job);
  if (!report)
    return { message: "This report is complete, cancelled or owned by another worker." };
  let fileId: string | undefined;
  try {
    const requests: ReportRequestRow[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await loadReportPage(job, cursor);
      if (!page)
        return { message: "Report generation was cancelled or its lease changed." };
      for (const row of page)
        requests.push({
          id: row.id,
          brokerName: row.broker.legalName,
          requestType: row.requestType,
          status: row.status,
          legalBasis: row.legalBasisText,
          deadlineAt: row.deadlineOn?.toISOString().slice(0, 10) ?? null,
          deadlineOn: row.deadlineOn?.toISOString().slice(0, 10) ?? null,
          deadlineIsEstimate: row.deadlineIsEstimate,
          deadlineBasis: row.deadlineBasis,
          deadlineNote: row.deadlineNote,
          sentAt: row.sentAt?.toISOString() ?? null,
          contactedAt:
            row.manualSubmissions[0]?.submittedOn.toISOString().slice(0, 10) ??
            row.outboundEmails[0]?.sentAt?.toISOString() ??
            null,
        });
      if (page.length < 250) break;
      cursor = page.at(-1)!.id;
    }
    const payload = buildReportPayload({
      dateFrom: report.dateFrom,
      dateTo: report.dateTo,
      timeZone: report.timeZone,
      profileLabel: report.profileLabel,
      requests,
    });
    const body =
      report.format === "PDF" ? await renderPdf(payload) : reportToJson(payload);
    const file = await storePrivateFile(systemActor(job.id), {
      userId: report.userId,
      profileId: report.profileId,
      kind: "REPORT",
      filename: `report.${report.format.toLowerCase()}`,
      contentType: report.format === "PDF" ? "application/pdf" : "application/json",
      body,
      deferReady: true,
    });
    fileId = file.id;
    const published = await publishReportFile(job, file.id, {
      requests: requests.length,
      brokers: payload.brokersContacted.length,
      openActions: payload.openActions.length,
    });
    if (!published)
      return { message: "Report generation was cancelled before publication." };
    await recordAudit({
      actor: systemActor(job.id),
      action: "report.generated",
      resourceType: "report",
      resourceId: report.id,
      targetUserId: report.userId,
    });
    return { message: "Report ready." };
  } catch (error) {
    await failReportGeneration(job);
    throw error;
  } finally {
    // If a commit response was lost, the linked file stays intact. Otherwise a
    // durable purge intent survives storage failure or process interruption.
    if (fileId) {
      const abandoned = await abandonUnpublishedReportFile(fileId);
      if (abandoned) await purgePrivateFile(abandoned).catch(() => undefined);
    }
  }
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
    doc.text(`Range: ${payload.dateFrom} to ${payload.dateTo} (${payload.timeZone})`);
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
      if (row.deadlineOn)
        doc
          .fontSize(9)
          .text(
            `Response target: ${row.deadlineOn}${row.deadlineIsEstimate ? " (estimate)" : " (recorded receipt)"}`,
            { indent: 12 }
          );
      if (row.deadlineNote) doc.fontSize(9).text(row.deadlineNote, { indent: 12 });
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
