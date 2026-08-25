"use server";

import { redirect } from "next/navigation";

import { anonymousAuditActor, recordAudit } from "@/lib/audit/service";
import { readRequestContext } from "@/lib/auth/requestContext";
import { decideHouseholdConsent } from "@/lib/household/service";
import { householdConsentDecisionSchema } from "@/lib/validation/enums";
import { formString, parseWithSchema } from "@/lib/validation/form";
import { z } from "zod";

export async function decideConsentAction(formData: FormData): Promise<void> {
  const token = formString(formData, "token");
  let doneStatus: string;
  try {
    const parsed = parseWithSchema(
      z.object({
        token: z.string().trim().min(10).max(200),
        decision: householdConsentDecisionSchema,
      }),
      {
        token,
        decision: formString(formData, "decision") === "agree" ? "agree" : "decline",
      }
    );
    const context = await readRequestContext();
    const result = await decideHouseholdConsent({
      token: parsed.token,
      decision: parsed.decision,
      ipHash: context.ipHash,
      userAgentHash: context.userAgentHash,
    });
    await recordAudit({
      actor: anonymousAuditActor(context.requestId, {
        ipHash: context.ipHash,
        userAgentHash: context.userAgentHash,
      }),
      action:
        parsed.decision === "agree"
          ? "household.consent_verified"
          : "household.consent_declined",
      resourceType: "household_consent",
    });
    doneStatus = result.status.toLowerCase();
  } catch {
    redirect(token ? `/household/consent/${token}?error=invalid` : "/");
  }
  redirect(`/household/consent/${token}?done=${doneStatus}`);
}
