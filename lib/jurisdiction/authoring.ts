/** Legal catalogue authoring uses public configuration and synthetic previews only. */
import { z } from "zod";
import { LegalConfidence, RequestType } from "@prisma/client";
import { ValidationError, isAppError } from "@/lib/core/errors";
import { canonicalJson, sha256Hex } from "@/lib/security/crypto";
import {
  sanitiseText,
  stripInvisible,
  detectSuspiciousContent,
} from "@/lib/security/sanitize";
import { parseWithSchema } from "@/lib/validation/form";
import { calendarDateSchema } from "@/lib/format/calendar";
import { TEMPLATE_CLAUSE_KEYS } from "@/lib/templates/clauses";
import { DEFAULT_TEMPLATE_SOURCE } from "@/lib/templates/authoring";
import { renderTemplate } from "@/lib/templates/renderer";
import { TEMPLATE_VARIABLES } from "@/lib/templates/variables";
import {
  deadlinePolicySchema,
  holidayCalendarSchema,
  readDeadlinePolicy,
  responseTarget,
} from "./deadlines";

export const legalSourceUrlSchema = z
  .url()
  .max(2000)
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      ![
        "localhost",
        "127.0.0.1",
        "[::1]",
        "example.com",
        "example.org",
        "example.net",
      ].includes(url.hostname) &&
      !/\.(?:localhost|invalid|test)$/.test(url.hostname)
    );
  }, "Use a public HTTPS source URL without credentials or an example domain.");
const optionalUrl = legalSourceUrlSchema.or(z.literal(""));
const utcInstant = z.iso.datetime();
const extensionSchema = deadlinePolicySchema.shape.extension;
export const legalVerificationSchema = z
  .object({
    identityVerificationExpected: z.boolean(),
    governmentIdExpected: z.boolean(),
    accountRequired: z.boolean(),
    authorisedAgentSupported: z.boolean().nullable(),
    notarisationExpected: z.boolean(),
    dataMinimisationNote: z.string().trim().min(10).max(2000),
  })
  .strict();
export const legalAdditionalSourcesSchema = z
  .array(
    z
      .object({
        title: z.string().trim().min(1).max(300),
        url: legalSourceUrlSchema,
      })
      .strict()
  )
  .max(30);
const supportedTypesSchema = z
  .array(z.enum(RequestType))
  .min(1)
  .max(Object.keys(RequestType).length)
  .refine(
    (values) => new Set(values).size === values.length,
    "Choose each request type once."
  );
const flags = [
  "identityVerificationExpected",
  "governmentIdExpected",
  "accountRequired",
  "notarisationExpected",
] as const;
const flagsSchema = z
  .array(z.enum(flags))
  .max(flags.length)
  .refine(
    (values) => new Set(values).size === values.length,
    "Choose each verification requirement once."
  );
const clausesSchema = z
  .array(
    z
      .string()
      .refine(
        (key) => TEMPLATE_CLAUSE_KEYS.includes(key),
        "Choose a known template clause."
      )
  )
  .max(TEMPLATE_CLAUSE_KEYS.length)
  .refine((values) => new Set(values).size === values.length, "Choose each clause once.");

const sourceFields = z.object({
  supportedRequestTypes: z.string().max(400),
  legalBasisText: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .refine(
      (value) =>
        !/[\r\n\u0000-\u001f\u007f]/.test(value) &&
        stripInvisible(value) === value &&
        !detectSuspiciousContent(value).length,
      "Use one plain-text line without headers, HTML or invisible characters."
    )
    .transform((value) =>
      sanitiseText(value, { maxLength: 400, fieldName: "legalBasisText" })
    ),
  deadlineUnit: z.enum(["NONE", "CALENDAR_DAYS", "CALENDAR_MONTHS", "BUSINESS_DAYS"]),
  deadlinePeriod: z
    .string()
    .trim()
    .max(3)
    .regex(
      /^\d*$/,
      "Enter a whole response period, or leave it empty for no fixed period."
    ),
  deadlineVerified: z.enum(["true", "false"]),
  deadlineSourceUrl: optionalUrl,
  deadlineRollForward: z.enum(["NONE", "NEXT_WORKING_DAY"]),
  deadlineCalendar: z.string().trim().max(50_000),
  deadlineExtension: z.string().trim().max(6000),
  deadlineConditions: z.string().trim().max(10_000),
  deadlineNotes: z.string().trim().max(4000),
  verificationFlags: z.string().max(300),
  authorisedAgentSupported: z.enum(["unknown", "true", "false"]),
  dataMinimisationNote: z.string().trim().min(10).max(2000),
  escalationPath: z.string().trim().min(1).max(4000),
  escalationAuthority: z.string().trim().max(300),
  escalationUrl: optionalUrl,
  templateClauses: z.string().max(2000),
  riskNotes: z.string().trim().min(1).max(10_000),
  requiresLegalReview: z.enum(["true", "false"]),
  confidence: z.enum(LegalConfidence),
  sourceUrl: legalSourceUrlSchema,
  sourceTitle: z.string().trim().min(1).max(300),
  additionalSources: z.string().trim().max(30_000),
  lastReviewedOn: calendarDateSchema,
  reviewedBy: z.string().trim().min(1).max(200),
  effectiveFrom: utcInstant,
  effectiveUntil: utcInstant.or(z.literal("")),
  changeNotes: z.string().trim().max(2000),
});
export type LegalSource = z.infer<typeof sourceFields>;
const split = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
function field<T>(schema: z.ZodType<T>, name: string, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ValidationError("This legal draft needs changes.", {
      fieldErrors: {
        [name]: parsed.error.issues.map((issue) => issue.message).join(" "),
      },
    });
  return parsed.data;
}
function jsonField<T>(schema: z.ZodType<T>, name: string, value: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ValidationError("This legal draft needs changes.", {
      fieldErrors: {
        [name]:
          "Enter valid JSON. Use null for no calendar or extension, and [] for no additional sources.",
      },
    });
  }
  return field(schema, name, parsed);
}
function buildContent(source: LegalSource) {
  const errors: Record<string, string> = {};
  if (source.lastReviewedOn > new Date().toISOString().slice(0, 10))
    errors.lastReviewedOn = "Use the actual review date; it cannot be in the future.";
  if (
    source.effectiveUntil &&
    Date.parse(source.effectiveUntil) <= Date.parse(source.effectiveFrom)
  )
    errors.effectiveUntil = "The end must be after the effective start.";
  if (source.confidence === "LOW" && source.requiresLegalReview !== "true")
    errors.requiresLegalReview = "Low-confidence rules must require legal review.";
  if (source.deadlineUnit === "NONE" && source.deadlinePeriod)
    errors.deadlinePeriod = "Leave the period empty when there is no fixed deadline.";
  if (source.deadlineUnit !== "NONE" && !source.deadlinePeriod)
    errors.deadlinePeriod = "Enter a response period for this unit.";
  if (source.deadlineVerified !== "true" && source.requiresLegalReview !== "true")
    errors.requiresLegalReview =
      "An unverified response period must require legal review.";
  if (Object.keys(errors).length)
    throw new ValidationError("This legal draft needs changes.", { fieldErrors: errors });
  const calendar = jsonField(
    holidayCalendarSchema.nullable(),
    "deadlineCalendar",
    source.deadlineCalendar
  );
  if (calendar) field(legalSourceUrlSchema, "deadlineCalendar", calendar.sourceUrl);
  if (calendar && calendar.reviewedOn > source.lastReviewedOn)
    throw new ValidationError("This legal draft needs changes.", {
      fieldErrors: {
        deadlineCalendar:
          "The calendar cannot claim a review later than this version's actual review date.",
      },
    });
  const extension = jsonField(
    extensionSchema,
    "deadlineExtension",
    source.deadlineExtension
  );
  if (
    source.deadlineUnit === "NONE" &&
    (extension || source.deadlineRollForward !== "NONE")
  )
    throw new ValidationError("This legal draft needs changes.", {
      fieldErrors: {
        deadlineExtension:
          "A policy without a fixed period cannot have an extension or final-day adjustment.",
      },
    });
  const policy = field(deadlinePolicySchema, "deadlinePeriod", {
    version: 1,
    unit: source.deadlineUnit,
    period: source.deadlinePeriod ? Number(source.deadlinePeriod) : null,
    startsFrom: "RECEIPT",
    sourceUrl: source.deadlineSourceUrl || source.sourceUrl,
    verified: source.deadlineVerified === "true",
    rollForward: source.deadlineRollForward,
    calendar,
    extension,
    conditions: source.deadlineConditions
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean),
    notes: source.deadlineNotes,
  });
  const selected = field(
    flagsSchema,
    "verificationFlags",
    split(source.verificationFlags)
  );
  const verification = field(legalVerificationSchema, "dataMinimisationNote", {
    identityVerificationExpected: selected.includes("identityVerificationExpected"),
    governmentIdExpected: selected.includes("governmentIdExpected"),
    accountRequired: selected.includes("accountRequired"),
    authorisedAgentSupported:
      source.authorisedAgentSupported === "unknown"
        ? null
        : source.authorisedAgentSupported === "true",
    notarisationExpected: selected.includes("notarisationExpected"),
    dataMinimisationNote: source.dataMinimisationNote,
  });
  return {
    supportedRequestTypes: field(
      supportedTypesSchema,
      "supportedRequestTypes",
      split(source.supportedRequestTypes)
    ).sort(),
    legalBasisText: source.legalBasisText,
    deadlineDays:
      policy.unit === "CALENDAR_DAYS" && policy.period! <= 365 ? policy.period : null,
    deadlineRule: { policy },
    verificationRequirements: verification,
    escalationPath: source.escalationPath,
    escalationAuthority: source.escalationAuthority || null,
    escalationUrl: source.escalationUrl || null,
    templateClauses: field(
      clausesSchema,
      "templateClauses",
      split(source.templateClauses)
    ).sort(),
    riskNotes: source.riskNotes,
    requiresLegalReview: source.requiresLegalReview === "true",
    confidence: source.confidence,
    sourceUrl: source.sourceUrl,
    sourceTitle: source.sourceTitle,
    additionalSources: jsonField(
      legalAdditionalSourcesSchema,
      "additionalSources",
      source.additionalSources
    ),
    lastReviewedAt: new Date(source.lastReviewedOn + "T00:00:00.000Z"),
    reviewedBy: source.reviewedBy,
    effectiveFrom: new Date(source.effectiveFrom),
    effectiveUntil: source.effectiveUntil ? new Date(source.effectiveUntil) : null,
    changeNotes: source.changeNotes,
  };
}
export const legalSourceSchema = sourceFields.superRefine((source, context) => {
  try {
    buildContent(source);
  } catch (error) {
    if (!isAppError(error)) throw error;
    for (const [name, message] of Object.entries(
      error.details.fieldErrors as Record<string, string>
    ))
      context.addIssue({ code: "custom", path: [name], message });
  }
});

export function prepareLegalSource(raw: unknown) {
  const source = parseWithSchema(legalSourceSchema, raw);
  const content = buildContent(source);
  const context = Object.fromEntries(
    TEMPLATE_VARIABLES.map((variable) => [variable.name, variable.example])
  );
  const previews = content.supportedRequestTypes.map((type) => ({
    type,
    ...renderTemplate(
      DEFAULT_TEMPLATE_SOURCE.subjectTemplate,
      DEFAULT_TEMPLATE_SOURCE.bodyTemplate,
      {
        ...context,
        "request.type": type,
        "request.legalBasis": content.legalBasisText,
        "consent.statement": "",
      }
    ),
  }));
  return {
    source,
    content,
    checksum: sha256Hex(canonicalJson(content)),
    previews,
    timingPreview: responseTarget({
      policy: content.deadlineRule,
      receiptOn: "2026-01-31",
      timeZone: "UTC",
    }),
  };
}
export function validateLegalPublication(raw: unknown) {
  const result = prepareLegalSource(raw);
  const errors: Record<string, string> = {};
  if (result.content.changeNotes.length < 10)
    errors.changeNotes =
      "Describe the sources, applicability and what you checked (at least 10 characters).";
  if (result.content.riskNotes.length < 20)
    errors.riskNotes =
      "Explain the applicability conditions, exceptions and uncertainties before publication.";
  if (result.content.escalationPath.length < 20)
    errors.escalationPath =
      "Describe the manual complaint or review path without implying that contact is automatic.";
  if (!result.content.templateClauses.length)
    errors.templateClauses = "Choose the clauses this legal version expects in a letter.";
  if (Object.keys(errors).length)
    throw new ValidationError("This draft needs changes before publication.", {
      fieldErrors: errors,
    });
  return result;
}

/** Converts historical rows faithfully: unsupported legacy timing stays invalid until reviewed. */
export function legalSourceFromVersion(version: {
  supportedRequestTypes: RequestType[];
  legalBasisText: string;
  deadlineRule: unknown;
  verificationRequirements: unknown;
  escalationPath: string;
  escalationAuthority: string | null;
  escalationUrl: string | null;
  templateClauses: unknown;
  riskNotes: string;
  requiresLegalReview: boolean;
  confidence: LegalConfidence;
  sourceUrl: string;
  sourceTitle: string;
  additionalSources: unknown;
  lastReviewedAt: Date;
  reviewedBy: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  changeNotes: string;
}): LegalSource {
  const policy = readDeadlinePolicy(version.deadlineRule);
  const verification = legalVerificationSchema.safeParse(
    version.verificationRequirements
  );
  return {
    supportedRequestTypes: version.supportedRequestTypes.join(","),
    legalBasisText: version.legalBasisText,
    deadlineUnit: policy?.unit ?? "NONE",
    deadlinePeriod: policy?.period ? String(policy.period) : "",
    deadlineVerified: policy?.verified ? "true" : "false",
    deadlineSourceUrl: policy?.sourceUrl ?? version.sourceUrl,
    deadlineRollForward: policy?.rollForward ?? "NONE",
    deadlineCalendar: policy
      ? JSON.stringify(policy.calendar, null, 2)
      : JSON.stringify(version.deadlineRule, null, 2),
    deadlineExtension: JSON.stringify(policy?.extension ?? null, null, 2),
    deadlineConditions: policy?.conditions.join("\n") ?? "",
    deadlineNotes:
      policy?.notes ??
      "This legacy timing policy must be checked against a primary source before publication.",
    verificationFlags: verification.success
      ? flags.filter((key) => verification.data[key]).join(",")
      : "",
    authorisedAgentSupported:
      verification.success && verification.data.authorisedAgentSupported !== null
        ? (String(verification.data.authorisedAgentSupported) as "true" | "false")
        : "unknown",
    dataMinimisationNote: verification.success
      ? verification.data.dataMinimisationNote
      : "",
    escalationPath: version.escalationPath,
    escalationAuthority: version.escalationAuthority ?? "",
    escalationUrl: version.escalationUrl ?? "",
    templateClauses: Array.isArray(version.templateClauses)
      ? version.templateClauses.join(",")
      : "",
    riskNotes: version.riskNotes,
    requiresLegalReview: version.requiresLegalReview ? "true" : "false",
    confidence: version.confidence,
    sourceUrl: version.sourceUrl,
    sourceTitle: version.sourceTitle,
    additionalSources: JSON.stringify(version.additionalSources, null, 2),
    lastReviewedOn: version.lastReviewedAt.toISOString().slice(0, 10),
    reviewedBy: version.reviewedBy,
    effectiveFrom: version.effectiveFrom.toISOString(),
    effectiveUntil: version.effectiveUntil?.toISOString() ?? "",
    changeNotes: version.changeNotes,
  };
}
export const DEFAULT_LEGAL_SOURCE: LegalSource = {
  supportedRequestTypes: "DELETION",
  legalBasisText: "",
  deadlineUnit: "NONE",
  deadlinePeriod: "",
  deadlineVerified: "false",
  deadlineSourceUrl: "",
  deadlineRollForward: "NONE",
  deadlineCalendar: "null",
  deadlineExtension: "null",
  deadlineConditions: "",
  deadlineNotes: "",
  verificationFlags: "",
  authorisedAgentSupported: "unknown",
  dataMinimisationNote:
    "Use the least intrusive verification. Government ID, birth dates and financial data are not supplied by default.",
  escalationPath: "",
  escalationAuthority: "",
  escalationUrl: "",
  templateClauses:
    "request-identification,legal-basis,identifier-list,confirmation-request,scope-limitation",
  riskNotes: "",
  requiresLegalReview: "true",
  confidence: "LOW",
  sourceUrl: "",
  sourceTitle: "",
  additionalSources: "[]",
  lastReviewedOn: "",
  reviewedBy: "",
  effectiveFrom: "",
  effectiveUntil: "",
  changeNotes: "",
};
