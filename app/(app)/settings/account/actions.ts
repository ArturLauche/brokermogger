"use server";

import { redirect } from "next/navigation";

import { requestAccountDeletion } from "@/lib/account/service";
import { requireActor } from "@/lib/auth";
import { updateOwnedAccount, revokeSession } from "@/lib/db/repositories/account";
import { recordAudit } from "@/lib/audit/service";
import { formString, parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { z } from "zod";

export async function updateAccountAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      timezone: z.string().trim().min(1).max(80),
    })
    .safeParse({
      name: formString(formData, "name"),
      timezone: formString(formData, "timezone") || "UTC",
    });
  if (!parsed.success) {
    redirect("/settings/account?error=validation");
  }
  await updateOwnedAccount(actor, parsed.data);
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
