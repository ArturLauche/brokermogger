"use server";

import { redirect } from "next/navigation";

import { requireActor } from "@/lib/auth";
import { requestReport } from "@/lib/reports/service";
import type { ReportFormat } from "@prisma/client";

export async function generateReportAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const dateFrom = new Date(String(formData.get("dateFrom") ?? ""));
  const dateTo = new Date(String(formData.get("dateTo") ?? ""));
  const profileId = String(formData.get("profileId") ?? "") || null;
  const format = String(formData.get("format") ?? "JSON") as ReportFormat;
  if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) {
    redirect("/reports?error=validation");
  }
  try {
    await requestReport(actor, { profileId, dateFrom, dateTo, format });
  } catch {
    redirect("/reports?error=failed");
  }
  redirect("/reports?queued=1");
}
