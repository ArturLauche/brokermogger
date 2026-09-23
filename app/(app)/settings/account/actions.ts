"use server";

import { redirect } from "next/navigation";

import { requestAccountDeletion } from "@/lib/account/service";
import { requireActor } from "@/lib/auth";
import { updateOwnedAccount, revokeSession } from "@/lib/db/repositories/account";
import { recordAudit } from "@/lib/audit/service";
import { formString, parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { type ActionState, failedAction } from "@/lib/validation/actionResult";

export type AccountFields = { name: string; timezone: string };
export async function updateAccountAction(
  _: ActionState<AccountFields>,
  data: FormData
): Promise<ActionState<AccountFields>> {
  const actor = await requireActor();
  const values = {
    name: formString(data, "name"),
    timezone: formString(data, "timezone"),
  };
  try {
    await updateOwnedAccount(actor, values);
    await recordAudit({
      actor,
      action: "account.updated",
      resourceType: "user",
      resourceId: actor.userId,
    });
  } catch (error) {
    return failedAction(error, values);
  }
  redirect("/settings/account?saved=1");
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await revokeSession(
    actor,
    parseWithSchema(entityIdSchema, formString(formData, "sessionId"))
  );
  await recordAudit({
    actor,
    action: "auth.session.revoked",
    resourceType: "session",
    resourceId: actor.sessionId,
  });
  redirect("/settings/account");
}

export async function deleteAccountAction(): Promise<void> {
  const actor = await requireActor();
  await requestAccountDeletion(actor);
  redirect("/");
}
