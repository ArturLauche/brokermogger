"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { requestAccountExport, deleteAccountExport } from "@/lib/exports/service";
import { failedAction, type ActionState } from "@/lib/validation/actionResult";
import { formCheckbox, formString } from "@/lib/validation/form";

export type ExportFormValues = {
  mode: string;
  confirmationAccepted: string;
  submissionKey: string;
};
export async function createExportAction(
  _previous: ActionState<ExportFormValues>,
  form: FormData
): Promise<ActionState<ExportFormValues>> {
  const actor = await requireActor();
  const values = {
    mode: formString(form, "mode"),
    confirmationAccepted: String(formCheckbox(form, "confirmationAccepted")),
    submissionKey: formString(form, "submissionKey"),
  };
  let id: string;
  try {
    ({ id } = await requestAccountExport(actor, {
      ...values,
      confirmationAccepted: values.confirmationAccepted === "true",
    }));
  } catch (error) {
    return failedAction(error, values);
  }
  revalidatePath("/settings/privacy/exports");
  redirect(`/settings/privacy/exports?queued=${id}#export-${id}`);
}
export async function deleteExportAction(
  _previous: ActionState<{ id: string }>,
  form: FormData
): Promise<ActionState<{ id: string }>> {
  const actor = await requireActor();
  const values = { id: formString(form, "id") };
  try {
    await deleteAccountExport(actor, values.id);
  } catch (error) {
    return failedAction(error, values);
  }
  revalidatePath("/settings/privacy/exports");
  redirect("/settings/privacy/exports?removed=1");
}
