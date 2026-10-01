import { z } from "zod";
import { recordAudit } from "@/lib/audit/service";
import { persistRequestReceipt } from "@/lib/db/repositories/requestReceipt";
import { calendarDateSchema } from "@/lib/format/calendar";
import type { ActorContext } from "@/lib/permissions/actor";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";

export const requestReceiptSchema = z
  .object({
    requestId: entityIdSchema,
    receivedOn: calendarDateSchema,
    previousAnchorOn: calendarDateSchema.nullable(),
    previousBasis: z
      .enum([
        "RECORDED_RECEIPT",
        "DISPATCH_ESTIMATE",
        "PROVIDER_DELIVERY_ESTIMATE",
        "SIMULATED_DISPATCH",
        "LEGACY_ESTIMATE",
      ])
      .nullable(),
    confirmationAccepted: z.literal(true, {
      error: "Confirm that this is the receipt date of the original request.",
    }),
  })
  .strict();
export type RequestReceiptCommand = z.infer<typeof requestReceiptSchema>;

export async function recordRequestReceipt(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(requestReceiptSchema, raw);
  await persistRequestReceipt(actor, input);
  await recordAudit({
    actor,
    action: "request.receipt_recorded",
    resourceType: "removal_request",
    resourceId: input.requestId,
  });
}
