import { z } from "zod";
import { recordAudit } from "@/lib/audit/service";
import { AppError } from "@/lib/core/errors";
import {
  beginApprovedDispatch,
  finishApprovedDispatch,
  recordAmbiguousDispatch,
} from "@/lib/db/repositories/requestDispatch";
import { getEmailProvider } from "@/lib/email";
import { consumeBrokerSendThrottles } from "@/lib/email/throttles";
import type { JobLease } from "@/lib/jobs/types";
import type { ActorContext } from "@/lib/permissions/actor";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";

const dispatchSchema = z.object({
  requestId: entityIdSchema,
  snapshotId: entityIdSchema,
  attempt: z.number().int().min(1).max(20),
  job: z.object({ id: entityIdSchema, leaseToken: z.string().uuid() }),
});

export async function sendApprovedRequest(
  actor: ActorContext,
  requestId: string,
  attempt: number,
  snapshotId: string,
  job: JobLease
): Promise<{ message: string }> {
  const input = parseWithSchema(dispatchSchema, { requestId, attempt, snapshotId, job });
  const prepared = await beginApprovedDispatch(actor, input, false);
  if (prepared.kind === "stopped") return { message: prepared.message };
  try {
    if (prepared.firstAttempt)
      await consumeBrokerSendThrottles({
        brokerId: prepared.brokerId,
        destination: prepared.message.to.address,
      });
    // Recheck the complete gates after throttling, immediately before the provider call.
    const current = await beginApprovedDispatch(actor, input);
    if (current.kind === "stopped") return { message: current.message };
    const result = await getEmailProvider().sendEmail(current.message);
    const saved = await finishApprovedDispatch({
      ...input,
      ledgerId: current.ledgerId,
      result,
    });
    if (!saved)
      return {
        message:
          "Dispatch returned after the lease or request changed. Its outcome requires reconciliation.",
      };
    await recordAudit({
      actor,
      action: "request.sent",
      resourceType: "removal_request",
      resourceId: requestId,
    });
    return {
      message:
        result.provider === "MOCK"
          ? "Approved request captured locally; no external message was sent."
          : "The provider accepted the approved message.",
    };
  } catch (error) {
    await recordAmbiguousDispatch({ ...input, ledgerId: prepared.ledgerId });
    if (error instanceof AppError) throw error;
    throw new AppError({
      code: "EMAIL_FAILED",
      message:
        "The provider outcome could not be confirmed. The worker will reconcile it before retrying.",
      cause: error,
    });
  }
}
