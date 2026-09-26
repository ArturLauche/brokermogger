"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor } from "@/lib/auth";
import { changeReportJob, requestReport } from "@/lib/reports/service";
import { failedAction, type ActionState } from "@/lib/validation/actionResult";
import { formString, parseWithSchema } from "@/lib/validation/form";

export type ReportFormValues = {
  dateFrom: string;
  dateTo: string;
  profileId: string;
  format: string;
  submissionKey: string;
};
export async function generateReportAction(
  _previous: ActionState<ReportFormValues>,
  form: FormData
): Promise<ActionState<ReportFormValues>> {
  const actor = await requireActor();
  const values = {
    dateFrom: formString(form, "dateFrom"),
    dateTo: formString(form, "dateTo"),
    profileId: formString(form, "profileId"),
    format: formString(form, "format"),
    submissionKey: formString(form, "submissionKey"),
  };
  let id: string;
  try {
    ({ id } = await requestReport(actor, {
      ...values,
      profileId: values.profileId || null,
    }));
  } catch (error) {
    return failedAction(error, values);
  }
  revalidatePath("/reports");
  redirect(`/reports?queued=${id}#report-${id}`);
}
export async function changeReportJobAction(
  _previous: ActionState<{ id: string; operation: string }>,
  form: FormData
): Promise<ActionState<{ id: string; operation: string }>> {
  const actor = await requireActor();
  const values = { id: formString(form, "id"), operation: formString(form, "operation") };
  try {
    const operation = parseWithSchema(z.enum(["retry", "cancel"]), values.operation);
    await changeReportJob(actor, { id: values.id, operation });
  } catch (error) {
    return failedAction(error, values);
  }
  revalidatePath("/reports");
  return {
    status: "success",
    message:
      values.operation === "retry"
        ? "Report queued again."
        : "Report generation cancelled.",
    code: null,
    fieldErrors: {},
    values,
  };
}
