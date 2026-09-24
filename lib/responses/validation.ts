import {
  BrokerResponseClassification,
  RequestChannel,
  RequestStatus,
} from "@prisma/client";
import { z } from "zod";
import { entityIdSchema } from "@/lib/validation/ids";

export const manualResponseSchema = z
  .object({
    requestId: entityIdSchema,
    submissionKey: z.uuid(),
    receivedOn: z.iso.date(),
    channel: z.enum(RequestChannel),
    fromAddress: z.string().trim().max(1000),
    subject: z
      .string()
      .trim()
      .min(1, "Enter the reply's subject or a brief label.")
      .max(1000),
    body: z.string().trim().max(100_000),
    evidenceFileId: entityIdSchema.nullable(),
  })
  .refine((value) => value.body.length > 0 || value.evidenceFileId !== null, {
    path: ["body"],
    message: "Paste the broker's reply or attach its evidence file.",
  });
export type ManualResponseCommand = z.infer<typeof manualResponseSchema>;

export const confirmResponseSchema = z.object({
  responseId: entityIdSchema,
  expectedRevision: z.coerce.number().int().min(0),
  expectedRequestStatus: z.enum(RequestStatus).nullable(),
  classification: z.enum(BrokerResponseClassification),
  applyToRequest: z.boolean(),
  confirmationAccepted: z.literal(true, {
    error: "Confirm that you reviewed the reply and selected this outcome.",
  }),
});
export type ConfirmResponseCommand = z.infer<typeof confirmResponseSchema>;

export const linkResponseSchema = z.object({
  responseId: entityIdSchema,
  requestId: entityIdSchema,
  expectedRevision: z.coerce.number().int().min(0),
});
export type LinkResponseCommand = z.infer<typeof linkResponseSchema>;
