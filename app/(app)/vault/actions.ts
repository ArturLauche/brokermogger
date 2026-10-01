"use server";

import { redirect } from "next/navigation";

import { exportAccountData, requestAccountDeletion } from "@/lib/account/service";
import { requireActor } from "@/lib/auth";
import {
  addIdentifier,
  updateOwnedIdentifier,
  revealOwnedIdentifier,
  softDeleteIdentifier,
  softDeleteProfile,
} from "@/lib/db/repositories/profiles";
import { recordAudit } from "@/lib/audit/service";
import { type ActionState, failedAction } from "@/lib/validation/actionResult";
import { identifierInputSchema } from "@/lib/profiles/validation";
import { formString, parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";

export async function revealIdentifierAction(identifierId: string): Promise<string> {
  const actor = await requireActor();
  const id = parseWithSchema(entityIdSchema, identifierId);
  const revealed = await revealOwnedIdentifier(actor, id);
  return revealed.value;
}

export type IdentifierFields = {
  identifierId: string;
  profileId: string;
  type: string;
  value: string;
  label: string;
};
export async function saveIdentifierAction(
  _: ActionState<IdentifierFields>,
  data: FormData
): Promise<ActionState<IdentifierFields>> {
  const actor = await requireActor();
  const values: IdentifierFields = {
    identifierId: formString(data, "identifierId"),
    profileId: formString(data, "profileId"),
    type: formString(data, "type"),
    value: formString(data, "value"),
    label: formString(data, "label"),
  };
  try {
    const input = parseWithSchema(identifierInputSchema, values);
    const result = values.identifierId
      ? await updateOwnedIdentifier(
          actor,
          parseWithSchema(entityIdSchema, values.identifierId),
          input
        )
      : await addIdentifier(
          actor,
          parseWithSchema(entityIdSchema, values.profileId),
          input
        );
    await recordAudit({
      actor,
      action: values.identifierId ? "identifier.updated" : "identifier.created",
      resourceType: "identifier",
      resourceId: result.id,
    });
  } catch (error) {
    return failedAction(error, values);
  }
  redirect("/vault?saved=identifier");
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
