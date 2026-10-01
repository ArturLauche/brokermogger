"use server";
import { redirect } from "next/navigation";
import type { ProfileFields } from "@/components/profiles/profile-fields";
import { recordAudit } from "@/lib/audit/service";
import { requireActor } from "@/lib/auth";
import { updateOwnedProfile } from "@/lib/db/repositories/profiles";
import { type ActionState, failedAction } from "@/lib/validation/actionResult";
import { formCheckbox, formString, parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
export type EditProfileFields = ProfileFields & { profileId: string };
export async function saveProfileAction(
  _: ActionState<EditProfileFields>,
  data: FormData
): Promise<ActionState<EditProfileFields>> {
  const actor = await requireActor();
  const values: EditProfileFields = {
    profileId: formString(data, "profileId"),
    displayName: formString(data, "displayName"),
    legalName: formString(data, "legalName"),
    contactEmail: formString(data, "contactEmail"),
    countryCode: formString(data, "countryCode"),
    region: formString(data, "region"),
    residencyConfirmed: formCheckbox(data, "residencyConfirmed") ? "true" : "false",
  };
  try {
    const id = parseWithSchema(entityIdSchema, values.profileId);
    await updateOwnedProfile(actor, id, {
      ...values,
      residencyConfirmed: values.residencyConfirmed === "true",
    });
    await recordAudit({
      actor,
      action: "profile.updated",
      resourceType: "profile",
      resourceId: id,
    });
  } catch (error) {
    return failedAction(error, values);
  }
  redirect("/vault?saved=profile");
}
