import { HouseholdRelationship } from "@prisma/client";
import { z } from "zod";
import { profileInputSchema } from "@/lib/profiles/validation";

export const CONSENT_STATEMENT =
  "I confirm that I am an adult, that the residence shown is correct, and that the account holder may prepare and send privacy requests about me using Brokermogger. I understand Brokermogger is not a law firm and does not guarantee removal. I can withdraw this permission using this invitation link.";
export const HOUSEHOLD_ADULT_CONFIRMATION =
  "I confirm this person is an adult and has asked me to invite them to manage their privacy requests.";
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/);
export const householdInvitationSchema = z.object({
  profile: profileInputSchema,
  relationship: z
    .enum(HouseholdRelationship)
    .refine((value) => value !== "SELF", "Choose the relationship to this adult."),
  adultConfirmed: z.literal(true, {
    error: "Confirm that this person is an adult and asked for an invitation.",
  }),
});
export const householdDecisionSchema = z
  .object({
    token: invitationTokenSchema,
    decision: z.enum(["agree", "decline", "revoke"]),
    adultConfirmed: z.boolean().default(false),
    residencyConfirmed: z.boolean().default(false),
    ipHash: z.string().max(128).nullable(),
    userAgentHash: z.string().max(128).nullable(),
  })
  .superRefine((input, context) => {
    if (
      input.decision === "agree" &&
      (!input.adultConfirmed || !input.residencyConfirmed)
    )
      context.addIssue({
        code: "custom",
        path: ["adultConfirmed"],
        message:
          "Confirm that you are an adult and that the displayed residence is correct.",
      });
  });
export type HouseholdInvitationInput = z.infer<typeof householdInvitationSchema>;
export type HouseholdDecisionInput = z.infer<typeof householdDecisionSchema>;
