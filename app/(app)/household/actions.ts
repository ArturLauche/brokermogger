"use server";

import { redirect } from "next/navigation";

import { requireActor } from "@/lib/auth";
import { inviteHouseholdAdult, removeHouseholdMember } from "@/lib/household/service";
import type { HouseholdRelationship } from "@prisma/client";

export async function inviteAdultAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const adultConfirmed = formData.get("adultConfirmed") === "on";
  try {
    await inviteHouseholdAdult(actor, {
      displayName: String(formData.get("displayName") ?? ""),
      relationship: String(
        formData.get("relationship") ?? "OTHER_ADULT"
      ) as HouseholdRelationship,
      invitedEmail: String(formData.get("invitedEmail") ?? "")
        .trim()
        .toLowerCase(),
      countryCode: String(formData.get("countryCode") ?? "DE").toUpperCase(),
      region: String(formData.get("region") ?? "") || null,
      adultConfirmed,
    });
  } catch {
    redirect("/household?error=invite");
  }
  redirect("/household?sent=1");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await removeHouseholdMember(actor, String(formData.get("memberId") ?? ""));
  redirect("/household");
}
