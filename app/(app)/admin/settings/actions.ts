"use server";

import { redirect } from "next/navigation";
import { changeSetting } from "@/lib/admin/settings";
import { requireActor } from "@/lib/auth";
import { type ActionState, failedAction } from "@/lib/validation/actionResult";
import { formString } from "@/lib/validation/form";
import { isAppError } from "@/lib/core/errors";
import { createLogger } from "@/lib/observability/logger";

export async function updateSettingAction(
  _: ActionState<Record<string, string>>,
  data: FormData
): Promise<ActionState<Record<string, string>>> {
  const actor = await requireActor();
  const values = Object.fromEntries(
    ["key", "value", "expectedUpdatedAt", "intent"].map((key) => [
      key,
      formString(data, key),
    ])
  );
  try {
    await changeSetting(actor, values);
  } catch (error) {
    if (!isAppError(error))
      createLogger("admin.settings").error({ err: error }, "Setting command failed");
    return failedAction(error, values);
  }
  redirect(
    `/admin/settings?saved=${encodeURIComponent(values.key!)}#${encodeURIComponent(values.key!)}`
  );
}
