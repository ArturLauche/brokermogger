import { z } from "zod";
import { recordAudit } from "@/lib/audit/service";
import {
  persistManualSubmission,
  persistDeliveryReconciliation,
  persistVerificationAction,
} from "@/lib/db/repositories/requestManual";
import type { ActorContext } from "@/lib/permissions/actor";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";

const dateOnly = z.iso.date().transform((value) => new Date(`${value}T00:00:00.000Z`));
export const manualSubmissionSchema = z
  .object({
    requestId: entityIdSchema,
    snapshotId: entityIdSchema,
    submittedOn: dateOnly,
    receivedOn: dateOnly.nullable(),
    evidenceFileId: entityIdSchema.nullable(),
    confirmationAccepted: z.literal(true, {
      error: "Confirm that you submitted this approved message yourself.",
    }),
  })
  .superRefine((value, context) => {
    if (value.receivedOn && value.receivedOn < value.submittedOn)
      context.addIssue({
        code: "custom",
        path: ["receivedOn"],
        message: "Receipt must be on or after submission.",
      });
  });
export type ManualSubmissionCommand = z.infer<typeof manualSubmissionSchema>;
export const reconciliationSchema = z.object({
  requestId: entityIdSchema,
  outboundEmailId: entityIdSchema,
  outcome: z.enum(["accepted", "not_sent"]),
  providerMessageId: z
    .string()
    .trim()
    .max(200)
    .regex(/^[A-Za-z0-9_.@<>:-]*$/)
    .nullable(),
  confirmationAccepted: z.literal(true, {
    error: "Confirm that you checked the provider’s records.",
  }),
});
export type ReconciliationCommand = z.infer<typeof reconciliationSchema>;
export const verificationActionSchema = z.object({
  requestId: entityIdSchema,
  outcome: z.enum(["provided", "declined"]),
  confirmationAccepted: z.literal(true),
});
export type VerificationActionCommand = z.infer<typeof verificationActionSchema>;
export async function recordManualSubmission(actor: ActorContext, raw: unknown) {
  const result = await persistManualSubmission(
    actor,
    parseWithSchema(manualSubmissionSchema, raw)
  );
  await recordAudit({
    actor,
    action: "request.status_changed",
    resourceType: "removal_request",
    resourceId: result.requestId,
    metadata: { submission: "manual", alreadyRecorded: result.alreadyRecorded },
  });
  return result;
}
export async function reconcileDelivery(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(reconciliationSchema, raw);
  await persistDeliveryReconciliation(actor, input);
  await recordAudit({
    actor,
    action: "request.status_changed",
    resourceType: "removal_request",
    resourceId: input.requestId,
    metadata: { reconciliation: input.outcome },
  });
}
export async function recordVerificationAction(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(verificationActionSchema, raw);
  await persistVerificationAction(actor, input);
  await recordAudit({
    actor,
    action: "request.status_changed",
    resourceType: "removal_request",
    resourceId: input.requestId,
    metadata: { verification: input.outcome },
  });
}
