"use server";

import { redirect } from "next/navigation";

import { exportAccountData, requestAccountDeletion } from "@/lib/account/service";
import { requireActor } from "@/lib/auth";
import {
  addIdentifier,
  revealOwnedIdentifier,
  softDeleteIdentifier,
  softDeleteProfile,
} from "@/lib/db/repositories/profiles";
import { identifierTypeSchema } from "@/lib/validation/enums";
import { formString, parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { z } from "zod";

export async function revealIdentifierAction(identifierId: string): Promise<string> {
  const actor = await requireActor();
  const id = parseWithSchema(entityIdSchema, identifierId);
  const revealed = await revealOwnedIdentifier(actor, id);
  return revealed.value;
}

export async function addIdentifierAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const parsed = z
    .object({
      profileId: entityIdSchema,
      type: identifierTypeSchema,
      value: z.string().trim().min(1).max(200),
    })
    .safeParse({
      profileId: formString(formData, "profileId"),
      type: formString(formData, "type") || "OTHER",
      value: formString(formData, "value").trim(),
    });
  if (!parsed.success) {
    redirect("/vault?error=validation");
  }
  await addIdentifier(actor, parsed.data.profileId, {
    type: parsed.data.type,
    value: parsed.data.value,
  });
  redirect("/vault");
}

export async function deleteIdentifierAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await softDeleteIdentifier(
    actor,
    parseWithSchema(entityIdSchema, formString(formData, "identifierId"))
  );
  redirect("/vault");
}

export async function deleteProfileAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await softDeleteProfile(
    actor,
    parseWithSchema(entityIdSchema, formString(formData, "profileId"))
  );
  redirect("/dashboard");
}

export async function deleteAccountFromVaultAction(): Promise<void> {
  const actor = await requireActor();
  await requestAccountDeletion(actor);
  redirect("/");
}

export async function downloadVaultExport(): Promise<void> {
  redirect("/settings/privacy");
}

export { exportAccountData };
