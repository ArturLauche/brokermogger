"use server";

import { redirect } from "next/navigation";

import { requestAccountDeletion } from "@/lib/account/service";
import { requireActor } from "@/lib/auth";
import { updateOwnedAccount, revokeSession } from "@/lib/db/repositories/account";
import { recordAudit } from "@/lib/audit/service";

export async function updateAccountAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "UTC").trim();
  if (name.length < 1 || name.length > 80) {
    redirect("/settings/account?error=validation");
  }
  await updateOwnedAccount(actor, { name, timezone });
  await recordAudit({
    actor,
    action: "account.updated",
    resourceType: "user",
    resourceId: actor.userId,
  });
  redirect("/settings/account?saved=1");
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await revokeSession(actor, String(formData.get("sessionId") ?? ""));
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
