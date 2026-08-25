"use server";

import { redirect } from "next/navigation";

import { requireActor } from "@/lib/auth";
import { requestReport } from "@/lib/reports/service";
import { reportFormatSchema } from "@/lib/validation/enums";
import { formString } from "@/lib/validation/form";
import { isoDateSchema, optionalEntityIdSchema } from "@/lib/validation/ids";
import { z } from "zod";

export async function generateReportAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const parsed = z
    .object({
      dateFrom: isoDateSchema,
      dateTo: isoDateSchema,
      profileId: optionalEntityIdSchema,
      format: reportFormatSchema,
    })
    .safeParse({
      dateFrom: formString(formData, "dateFrom"),
      dateTo: formString(formData, "dateTo"),
      profileId: formString(formData, "profileId"),
      format: formString(formData, "format") || "JSON",
    });
  if (!parsed.success) {
    redirect("/reports?error=validation");
  }
  try {
    await requestReport(actor, parsed.data);
  } catch {
    redirect("/reports?error=failed");
  }
  redirect("/reports?queued=1");
}
