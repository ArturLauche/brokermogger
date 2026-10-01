import { z } from "zod";
import { DataCategory } from "@prisma/client";
import {
  brokerCategorySchema,
  brokerVerificationStatusSchema,
} from "@/lib/validation/enums";
import { entityIdSchema } from "@/lib/validation/ids";
import { optionalPublicUrlSchema, publicUrlSchema } from "@/lib/validation/publicUrl";
import { INITIAL_REQUEST_TYPES } from "@/lib/requests/initial";
import { isValidEmailAddress, sanitiseText } from "@/lib/security/sanitize";

const flag = z.enum(["true", "false"]).transform((value) => value === "true");
const text = (max: number, multiline = false) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) =>
      value ? sanitiseText(value, { maxLength: max, multiline }) : ""
    );
const reviewDate = z.iso
  .date()
  .refine(
    (value) => value <= new Date().toISOString().slice(0, 10),
    "A review date cannot be in the future."
  )
  .or(z.literal(""));
const stringList = z
  .string()
  .max(4000)
  .transform((value) => [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ]);
export const brokerEditScope = z.object({
  brokerId: entityIdSchema,
  expectedUpdatedAt: z.iso.datetime(),
});

export const brokerCommandSchema = z.object({
  brokerId: entityIdSchema.or(z.literal("")),
  expectedUpdatedAt: z.iso.datetime().or(z.literal("")),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, digits and single hyphens."
    ),
  legalName: text(200).pipe(z.string().min(1, "Enter the broker's legal name.")),
  websiteUrl: optionalPublicUrlSchema,
  category: brokerCategorySchema,
  tradingNames: text(2000, true)
    .transform((value) =>
      value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().max(200)).max(30)),
  countriesServed: stringList.pipe(
    z
      .array(
        z
          .string()
          .regex(
            /^[A-Z]{2}$/,
            "Use two-letter uppercase country codes, separated by commas."
          )
      )
      .max(250)
  ),
  dataCategories: stringList.pipe(z.array(z.enum(DataCategory))),
  sourceUrl: optionalPublicUrlSchema,
  lastVerifiedAt: reviewDate,
  verificationStatus: brokerVerificationStatusSchema,
  confidenceScore: z.coerce.number().int().min(0).max(100),
  isActive: flag,
  isDemoData: flag,
  productionUnsafeFlag: flag,
  manualReviewRequired: flag,
  expectsIdentityDocument: flag,
  accountRequired: flag,
  notarisationRequired: flag,
  verificationInstructions: text(4000, true),
  riskTier: z.enum(["STANDARD", "ELEVATED", "RESTRICTED"]),
  notes: text(4000, true),
});

export const contactCommandSchema = brokerEditScope
  .extend({
    contactId: entityIdSchema.or(z.literal("")),
    type: z.enum([
      "EMAIL",
      "WEB_FORM",
      "PRIVACY_PORTAL_URL",
      "POSTAL",
      "API",
      "DROP_PLATFORM",
    ]),
    value: text(2000, true).pipe(z.string().min(1)),
    label: text(120),
    isPreferred: flag,
    isActive: flag,
    isVerified: flag,
    verifiedAt: reviewDate,
    sourceUrl: optionalPublicUrlSchema,
    verificationNote: text(2000, true),
    priority: z.coerce.number().int().min(0).max(1000),
  })
  .superRefine((value, ctx) => {
    if (value.type === "EMAIL" && !isValidEmailAddress(value.value))
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Enter a valid email address without line breaks.",
      });
    if (
      !["EMAIL", "POSTAL"].includes(value.type) &&
      !publicUrlSchema.safeParse(value.value).success
    )
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Enter an HTTP or HTTPS URL without credentials.",
      });
    if (value.isVerified) {
      if (!value.sourceUrl)
        ctx.addIssue({
          code: "custom",
          path: ["sourceUrl"],
          message: "Record the public source used to verify this method.",
        });
      if (!value.verifiedAt)
        ctx.addIssue({
          code: "custom",
          path: ["verifiedAt"],
          message: "Record when you checked this method.",
        });
      if (value.verificationNote.length < 10)
        ctx.addIssue({
          code: "custom",
          path: ["verificationNote"],
          message: "Describe how you verified the method (at least 10 characters).",
        });
    }
  });

export const coverageCommandSchema = brokerEditScope.extend({
  jurisdictionId: entityIdSchema,
  coverageType: z.enum(["STATUTORY", "VOLUNTARY_OPT_OUT", "UNKNOWN"]),
  supportedRequestTypes: stringList.pipe(
    z
      .array(z.enum(INITIAL_REQUEST_TYPES))
      .min(1, "Choose at least one supported initial request type.")
  ),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  isActive: flag,
  notes: text(2000, true).pipe(
    z.string().min(10, "Record the source and any applicability conditions.")
  ),
});

export const sendingCommandSchema = brokerEditScope.extend({ enabled: flag });
