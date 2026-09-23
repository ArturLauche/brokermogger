"use server";
import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import {
  inviteHouseholdAdult,
  removeHouseholdMember,
  resendHouseholdInvitation,
  revokeHouseholdConsent,
} from "@/lib/household/service";
import { formCheckbox, formString } from "@/lib/validation/form";
import { type ActionState, failedAction } from "@/lib/validation/actionResult";
import type { ProfileFields } from "@/components/profiles/profile-fields";
export type InvitationFields = ProfileFields & {
  relationship: string;
  adultConfirmed: string;
};
export async function inviteAdultAction(
  _: ActionState<InvitationFields>,
  data: FormData
): Promise<ActionState<InvitationFields>> {
  const actor = await requireActor();
  const values: InvitationFields = {
    displayName: formString(data, "displayName"),
    legalName: formString(data, "legalName"),
    contactEmail: formString(data, "contactEmail"),
    countryCode: formString(data, "countryCode"),
    region: formString(data, "region"),
    residencyConfirmed: formCheckbox(data, "residencyConfirmed") ? "true" : "false",
    relationship: formString(data, "relationship"),
    adultConfirmed: formCheckbox(data, "adultConfirmed") ? "true" : "false",
  };
  try {
    const result = await inviteHouseholdAdult(actor, {
      profile: { ...values, residencyConfirmed: values.residencyConfirmed === "true" },
      relationship: values.relationship,
      adultConfirmed: values.adultConfirmed === "true",
    });
    revalidatePath("/household");
    return {
      status: "success",
      code: null,
      fieldErrors: {},
      values: {
        displayName: "Household adult",
        legalName: "",
        contactEmail: "",
        countryCode: values.countryCode,
        region: "",
        residencyConfirmed: "false",
        relationship: "OTHER_ADULT",
        adultConfirmed: "false",
      },
      message: deliveryMessage(result.delivery),
    };
  } catch (error) {
    const failed = failedAction(error, values);
    failed.fieldErrors = Object.fromEntries(
      Object.entries(failed.fieldErrors).map(([key, value]) => [
        key.replace(/^profile\./, ""),
        value,
      ])
    );
    return failed;
  }
}
function deliveryMessage(delivery: "sent" | "simulated" | "failed") {
  return delivery === "sent"
    ? "The invitation was submitted to the email provider. The adult must accept it before requests can be prepared."
    : delivery === "simulated"
      ? "The profile was saved. Email delivery is simulated on this instance; no invitation was sent externally."
      : "The profile was saved, but invitation delivery could not be confirmed. Use Send new invitation below to try again; the old link will be revoked.";
}
export type MemberFields = { memberId: string };
export async function manageMemberAction(
  _: ActionState<MemberFields>,
  data: FormData
): Promise<ActionState<MemberFields>> {
  const actor = await requireActor();
  const values = { memberId: formString(data, "memberId") };
  try {
    const intent = formString(data, "intent");
    let message: string;
    if (intent === "resend")
      message = deliveryMessage(
        (await resendHouseholdInvitation(actor, values.memberId)).delivery
      );
    else if (intent === "revoke") {
      await revokeHouseholdConsent(actor, values.memberId);
      message =
        "Permission withdrawn. New requests and queued sends are blocked. A message already accepted by a provider cannot be recalled.";
    } else if (intent === "remove") {
      await removeHouseholdMember(actor, values.memberId);
      message =
        "The profile and its personal content have been erased. Stored files are queued for cleanup.";
    } else
      return {
        ...failedAction(null, values),
        message: "Choose an available household action.",
      };
    revalidatePath("/household");
    return { status: "success", message, code: null, fieldErrors: {}, values };
  } catch (error) {
    return failedAction(error, values);
  }
}
