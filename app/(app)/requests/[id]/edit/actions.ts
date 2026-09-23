"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { editRequestDraft, regenerateRequestDraft } from "@/lib/requests/editing";
import { failedAction, type ActionState } from "@/lib/validation/actionResult";
import { formString } from "@/lib/validation/form";

export type DraftFields = {
  requestId: string;
  previousSnapshotId: string;
  subject: string;
  body: string;
};

export async function saveDraftAction(
  _previous: ActionState<DraftFields>,
  formData: FormData
): Promise<ActionState<DraftFields>> {
  const actor = await requireActor();
  const values = {
    requestId: formString(formData, "requestId"),
    previousSnapshotId: formString(formData, "previousSnapshotId"),
    subject: formString(formData, "subject"),
    body: formString(formData, "body"),
  };
  try {
    if (formString(formData, "intent") === "regenerate")
      await regenerateRequestDraft(actor, values.requestId, values.previousSnapshotId);
    else await editRequestDraft(actor, values);
  } catch (error) {
    return failedAction(error, values);
  }
  redirect(`/requests/${values.requestId}/review?saved=1`);
}
