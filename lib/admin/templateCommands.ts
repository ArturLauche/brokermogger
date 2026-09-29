import { z } from "zod";
import { RequestChannel, RequestType } from "@prisma/client";
import { entityIdSchema } from "@/lib/validation/ids";
import { templateSourceSchema } from "@/lib/templates/authoring";
import { sanitiseText } from "@/lib/security/sanitize";

const metadata = {
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .transform((value) => sanitiseText(value, { maxLength: 200 })),
  description: z.string().trim().max(2000),
};
export const createTemplateSchema = z.object({
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
  requestType: z.enum(RequestType),
  channel: z.enum(RequestChannel),
  jurisdictionId: entityIdSchema.or(z.literal("")),
  ...templateSourceSchema.shape,
});
export const templateScopeSchema = z.object({
  templateId: entityIdSchema,
  expectedUpdatedAt: z.iso.datetime(),
});
export const templateMetadataSchema = templateScopeSchema.extend(metadata);
export const templateVersionScopeSchema = templateScopeSchema.extend({
  versionId: entityIdSchema,
});
export const saveTemplateDraftSchema = templateVersionScopeSchema.extend(
  templateSourceSchema.shape
);
export const publishTemplateSchema = templateVersionScopeSchema.extend({
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  reviewed: z.literal("yes", {
    error: "Confirm that you reviewed the saved preview before publishing.",
  }),
});
