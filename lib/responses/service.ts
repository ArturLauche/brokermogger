import { recordAudit } from "@/lib/audit/service";
import {
  recordManualResponse,
  confirmOwnedResponse,
  linkOwnedResponse,
  deleteOwnedResponse,
} from "@/lib/db/repositories/responses";
import type { ActorContext } from "@/lib/permissions/actor";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import {
  manualResponseSchema,
  confirmResponseSchema,
  linkResponseSchema,
} from "./validation";

export async function recordResponse(actor: ActorContext, raw: unknown) {
  const result = await recordManualResponse(
    actor,
    parseWithSchema(manualResponseSchema, raw)
  );
  if (!result.alreadyRecorded)
    await recordAudit({
      actor,
      action: "broker_response.recorded",
      resourceType: "broker_response",
      resourceId: result.id,
    });
  return result;
}
export async function confirmResponse(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(confirmResponseSchema, raw);
  await confirmOwnedResponse(actor, input);
  await recordAudit({
    actor,
    action: "broker_response.confirmed",
    resourceType: "broker_response",
    resourceId: input.responseId,
    metadata: {
      classification: input.classification,
      appliedToRequest: input.applyToRequest,
    },
  });
}
export async function linkResponse(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(linkResponseSchema, raw);
  await linkOwnedResponse(actor, input);
  await recordAudit({
    actor,
    action: "broker_response.matched",
    resourceType: "broker_response",
    resourceId: input.responseId,
  });
}
export async function deleteResponse(actor: ActorContext, rawId: unknown) {
  const id = parseWithSchema(entityIdSchema, rawId);
  await deleteOwnedResponse(actor, id);
  await recordAudit({
    actor,
    action: "broker_response.deleted",
    resourceType: "broker_response",
    resourceId: id,
  });
}
