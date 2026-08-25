"use server";

import { redirect } from "next/navigation";

import { requireActor } from "@/lib/auth";
import { inviteHouseholdAdult, removeHouseholdMember } from "@/lib/household/service";
import { householdRelationshipSchema } from "@/lib/validation/enums";
import { formCheckbox, formString, parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { z } from "zod";

export async function inviteAdultAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  try {
    const input = parseWithSchema(
      z.object({
        displayName: z.string().trim().min(1).max(120),
        relationship: householdRelationshipSchema,
        invitedEmail: z.email().max(254),
        countryCode: z.string().length(2),
        region: z.string().max(80).optional(),
        adultConfirmed: z.literal(true),
      }),
      {
        displayName: formString(formData, "displayName"),
        relationship: formString(formData, "relationship") || "OTHER_ADULT",
        invitedEmail: formString(formData, "invitedEmail").trim().toLowerCase(),
        countryCode: formString(formData, "countryCode").toUpperCase() || "DE",
        region: formString(formData, "region") || undefined,
        adultConfirmed: formCheckbox(formData, "adultConfirmed") ? true : false,
      }
    );
    await inviteHouseholdAdult(actor, {
      ...input,
      region: input.region || null,
    });
  } catch {
    redirect("/household?error=invite");
  }
  redirect("/household?sent=1");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await removeHouseholdMember(
    actor,
    parseWithSchema(entityIdSchema, formString(formData, "memberId"))
  );
  redirect("/household");
}
