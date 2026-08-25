"use server";

import { redirect } from "next/navigation";

import { requireActor } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { MAX_BROKERS_PER_WORKFLOW } from "@/lib/requests/fairUse";
import { generateRequests } from "@/lib/requests/lifecycle";
import { requestTypeSchema } from "@/lib/validation/enums";
import { formString, formStrings } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { z } from "zod";

const workflowSchema = z.object({
  profileId: entityIdSchema,
  requestType: requestTypeSchema,
  brokerIds: z
    .array(entityIdSchema)
    .min(1)
    .max(MAX_BROKERS_PER_WORKFLOW)
    .transform((ids) => [...new Set(ids)]),
  identifierIds: z.array(entityIdSchema).min(1),
});

export async function createWorkflow(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const parsed = workflowSchema.safeParse({
    profileId: formString(formData, "profileId"),
    requestType: formString(formData, "requestType") || "DELETION",
    brokerIds: formStrings(formData, "brokerId"),
    identifierIds: formStrings(formData, "identifierId"),
  });

  if (!parsed.success) {
    redirect("/requests/new?error=VALIDATION_FAILED");
  }

  try {
    const result = await generateRequests(actor, parsed.data);
    redirect(`/requests?created=${result.requestIds.length}`);
  } catch (error) {
    if (isAppError(error)) {
      redirect(`/requests/new?error=${error.code}`);
    }
    throw error;
  }
}
