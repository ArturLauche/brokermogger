"use server";
import { redirect } from "next/navigation";
import { anonymousAuditActor, recordAudit } from "@/lib/audit/service";
import { readRequestContext } from "@/lib/auth/requestContext";
import { decideHouseholdConsent } from "@/lib/household/service";
import { type ActionState, failedAction } from "@/lib/validation/actionResult";
import { formCheckbox, formString } from "@/lib/validation/form";
export type ConsentFields = {
  token: string;
  adultConfirmed: string;
  residencyConfirmed: string;
};
export async function decideConsentAction(
  _: ActionState<ConsentFields>,
  data: FormData
): Promise<ActionState<ConsentFields>> {
  const values = {
    token: formString(data, "token"),
    adultConfirmed: formCheckbox(data, "adultConfirmed") ? "true" : "false",
    residencyConfirmed: formCheckbox(data, "residencyConfirmed") ? "true" : "false",
  };
  try {
    const context = await readRequestContext();
    const result = await decideHouseholdConsent({
      ...values,
      decision: formString(data, "decision"),
      adultConfirmed: values.adultConfirmed === "true",
      residencyConfirmed: values.residencyConfirmed === "true",
      ipHash: context.ipHash,
      userAgentHash: context.userAgentHash,
    });
    await recordAudit({
      actor: anonymousAuditActor(context.requestId, {
        ipHash: context.ipHash,
        userAgentHash: context.userAgentHash,
      }),
      action:
        result.status === "VERIFIED"
          ? "household.consent_verified"
          : result.status === "REVOKED"
            ? "household.consent_revoked"
            : "household.consent_declined",
      resourceType: "household_consent",
      resourceId: result.consentId,
    });
  } catch (error) {
    return failedAction(error, values);
  }
  redirect(`/household/consent/${encodeURIComponent(values.token)}`);
}
