import { recordAudit } from "@/lib/audit/service";
import { commitRequestApproval } from "@/lib/db/repositories/requestApproval";
import type { ActorContext } from "@/lib/permissions/actor";
import { parseWithSchema } from "@/lib/validation/form";
import { approvalCommandSchema } from "./envelope";

export async function approveRequest(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(approvalCommandSchema, raw);
  const result = await commitRequestApproval(actor, input);
  if (!result.alreadyApproved)
    await recordAudit({
      actor,
      action: "request.approved",
      resourceType: "removal_request",
      resourceId: result.requestId,
      metadata: { envelopeHash: input.envelopeHash },
    });
  return result;
}
