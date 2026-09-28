"use server";

import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { generateRequests } from "@/lib/requests/lifecycle";
import { failedAction, type ActionState } from "@/lib/validation/actionResult";
import { formString, formStrings } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";

export type WorkflowFields = {
  profileId: string;
  requestType: string;
  brokerIds: string;
  identifierIds: string;
};
export type WorkflowState = ActionState<WorkflowFields> & {
  existingRequestIds?: string[];
};

export async function createWorkflow(
  _previous: WorkflowState,
  formData: FormData
): Promise<WorkflowState> {
  const actor = await requireActor();
  const brokerIds = formStrings(formData, "brokerId");
  const identifierIds = formStrings(formData, "identifierId");
  const values = {
    profileId: formString(formData, "profileId"),
    requestType: formString(formData, "requestType"),
    brokerIds: brokerIds.join(","),
    identifierIds: identifierIds.join(","),
  };
  let result;
  try {
    // The domain boundary validates all callers, including forged contextual types.
    result = await generateRequests(actor, { ...values, brokerIds, identifierIds });
  } catch (error) {
    const failed: WorkflowState = failedAction(error, values);
    failed.fieldErrors = Object.fromEntries(
      Object.entries(failed.fieldErrors).map(([key, value]) => [key.split(".")[0], value])
    );
    if (
      isAppError(error) &&
      error.code === "CONFLICT" &&
      Array.isArray(error.details.requestIds)
    )
      failed.existingRequestIds = error.details.requestIds.filter(
        (id): id is string => entityIdSchema.safeParse(id).success
      );
    return failed;
  }
  redirect(`/requests?created=${result.requestIds.length}`);
}
