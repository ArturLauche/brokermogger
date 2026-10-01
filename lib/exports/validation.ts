import { z } from "zod";
export const exportInputSchema = z
  .object({
    mode: z.enum(["MASKED", "SENSITIVE"]),
    confirmationAccepted: z.boolean().default(false),
    submissionKey: z.uuid(),
  })
  .superRefine((value, context) => {
    if (value.mode === "SENSITIVE" && !value.confirmationAccepted)
      context.addIssue({
        code: "custom",
        path: ["confirmationAccepted"],
        message: "Confirm that you want a copy containing unmasked personal data.",
      });
  });
