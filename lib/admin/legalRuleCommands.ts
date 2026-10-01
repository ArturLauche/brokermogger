import { z } from "zod";
import { entityIdSchema } from "@/lib/validation/ids";
import { legalSourceSchema } from "@/lib/jurisdiction/authoring";
import { sanitiseText } from "@/lib/security/sanitize";

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .transform((value) => sanitiseText(value, { maxLength: max }));
const metadata = {
  lawName: text(300),
  shortName: text(150),
  description: z.string().trim().max(2000),
};
export const createLegalRuleSchema = z.object({
  ...metadata,
  key: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/,
      "Use lowercase letters, numbers, dots and hyphens."
    ),
  jurisdictionId: entityIdSchema,
  ...legalSourceSchema.shape,
});
export const legalRuleScopeSchema = z.object({
  legalRuleId: entityIdSchema,
  expectedUpdatedAt: z.iso.datetime(),
});
export const legalRuleMetadataSchema = legalRuleScopeSchema.extend(metadata);
export const legalRuleVersionScopeSchema = legalRuleScopeSchema.extend({
  versionId: entityIdSchema,
});
export const saveLegalDraftSchema = legalRuleVersionScopeSchema.extend(
  legalSourceSchema.shape
);
export const publishLegalRuleSchema = legalRuleVersionScopeSchema.extend({
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  reviewed: z.literal("yes", {
    error:
      "Confirm that you reviewed this saved version, its primary sources and applicability.",
  }),
});
