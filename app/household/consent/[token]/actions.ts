"use server";

import { redirect } from "next/navigation";

import { anonymousAuditActor, recordAudit } from "@/lib/audit/service";
import { readRequestContext } from "@/lib/auth/requestContext";
import { decideHouseholdConsent } from "@/lib/household/service";

export async function decideConsentAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const decision = formData.get("decision") === "agree" ? "agree" : "decline";
  const context = await readRequestContext();
  const result = await decideHouseholdConsent({
    token,
    decision,
    ipHash: context.ipHash,
    userAgentHash: context.userAgentHash,
  });
  await recordAudit({
    actor: anonymousAuditActor(context.requestId, {
      ipHash: context.ipHash,
      userAgentHash: context.userAgentHash,
    }),
    action:
      decision === "agree" ? "household.consent_verified" : "household.consent_declined",
    resourceType: "household_consent",
  });
  redirect(`/household/consent/${token}?done=${result.status.toLowerCase()}`);
}
