"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { saveNotificationPreferences } from "@/lib/notifications/service";
import { updateOwnedNotification } from "@/lib/db/repositories/notifications";
import { failedAction, type ActionState } from "@/lib/validation/actionResult";
import { formCheckbox, formString } from "@/lib/validation/form";

export async function savePreferencesAction(
  _previous: ActionState<{ emailEnabled: string }>,
  form: FormData
): Promise<ActionState<{ emailEnabled: string }>> {
  const actor = await requireActor();
  const emailEnabled = formCheckbox(form, "emailEnabled");
  const values = { emailEnabled: String(emailEnabled) };
  try {
    await saveNotificationPreferences(actor, { emailEnabled });
  } catch (error) {
    return failedAction(error, values);
  }
  revalidatePath("/notifications");
  return {
    status: "success",
    message: emailEnabled
      ? "Email reminders are on for new notifications."
      : "Email reminders are off. Your in-app notifications remain available.",
    values,
    code: null,
    fieldErrors: {},
  };
}

export async function updateNotificationAction(
  _previous: ActionState<{ id: string; operation: string }>,
  form: FormData
): Promise<ActionState<{ id: string; operation: string }>> {
  const actor = await requireActor();
  const values = { id: formString(form, "id"), operation: formString(form, "operation") };
  try {
    await updateOwnedNotification(actor, values);
  } catch (error) {
    return failedAction(error, values);
  }
  revalidatePath("/notifications");
  return {
    status: "success",
    message: "Notification updated.",
    values,
    code: null,
    fieldErrors: {},
  };
}
