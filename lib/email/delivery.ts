import { z } from "zod";

/** Delivery reconciliation needs no recipient addresses, subject, or provider diagnostics. */
export const deliveryPayloadSchema = z.object({
  created_at: z.iso.datetime({ offset: true }).optional(),
  data: z.object({ email_id: z.string().min(1).max(200) }),
});

export function minimalDeliveryPayload(input: unknown) {
  const parsed = deliveryPayloadSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
