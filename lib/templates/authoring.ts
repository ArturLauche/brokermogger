import { z } from "zod";
import { isAppError, ValidationError } from "@/lib/core/errors";
import { sha256Hex } from "@/lib/security/crypto";
import { parseWithSchema } from "@/lib/validation/form";
import { renderTemplate } from "./renderer";
import { templateSyntaxErrors } from "./syntax";
import {
  extractPlaceholders,
  TEMPLATE_VARIABLES,
  getVariableDefinition,
  type RenderContext,
} from "./variables";

export const templateSourceSchema = z
  .object({
    subjectTemplate: z.string().trim().min(1).max(1000),
    bodyTemplate: z
      .string()
      .max(100_000)
      .transform((value) => value.replace(/\r\n?/g, "\n"))
      .pipe(z.string().trim().min(1).max(50_000)),
    locale: z
      .string()
      .trim()
      .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, "Use a language code such as en or en-GB."),
    changeNotes: z.string().trim().max(2000),
  })
  .superRefine((source, context) => {
    for (const [field, message] of Object.entries(
      templateSyntaxErrors(source.subjectTemplate, source.bodyTemplate)
    ))
      context.addIssue({ code: "custom", path: [field], message });
  });

export type TemplateSource = z.infer<typeof templateSourceSchema>;
export const DEFAULT_TEMPLATE_SOURCE: TemplateSource = {
  subjectTemplate: "Privacy request ({{request.type}}) - reference {{request.reference}}",
  bodyTemplate: `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request under {{request.legalBasis}}, where these provisions apply.

The request concerns {{profile.fullName}}, resident in {{profile.country}}. Use the following approved identifiers only to locate matching records:

{{identifiers.list}}

{{consent.statement}}

Please confirm how you handled this request, including any applicable exception or further verification needed. Reply to {{reply.address}} and include the reference below.

Reference: {{request.reference}}
Date: {{today}}

{{profile.fullName}}`,
  locale: "en",
  changeNotes: "",
};
const REQUIRED_BODY_VARIABLES = [
  "profile.fullName",
  "profile.country",
  "request.type",
  "request.legalBasis",
  "request.reference",
  "broker.name",
  "identifiers.list",
  "reply.address",
  "today",
  "consent.statement",
] as const;

function renderPreview(source: TemplateSource, context: RenderContext) {
  try {
    return renderTemplate(source.subjectTemplate, source.bodyTemplate, context);
  } catch (error) {
    if (!isAppError(error)) throw error;
    throw new ValidationError("The synthetic preview could not be rendered.", {
      fieldErrors: {
        subjectTemplate:
          "The completed subject must be one non-empty line of at most 200 characters in both previews. Shorten the text or use fewer placeholders.",
      },
    });
  }
}

/** Synthetic previews never read profiles, identifiers, accounts or broker contacts. */
export function prepareTemplateSource(raw: unknown) {
  const source = parseWithSchema(templateSourceSchema, raw);
  const context = Object.fromEntries(TEMPLATE_VARIABLES.map((v) => [v.name, v.example]));
  const preview = renderPreview(source, context);
  const selfPreview = renderPreview(source, {
    ...context,
    "consent.statement": "",
    "profile.region": "",
    "request.deadlineDate": "",
  });
  const used = extractPlaceholders(`${source.subjectTemplate}\n${source.bodyTemplate}`);
  return {
    source,
    preview: { subject: preview.subject, body: preview.body },
    selfPreview: { subject: selfPreview.subject, body: selfPreview.body },
    checksum: sha256Hex(`${source.subjectTemplate}\n${source.bodyTemplate}`),
    requiredVariables: used.filter((name) => getVariableDefinition(name)?.required),
    optionalVariables: used.filter((name) => !getVariableDefinition(name)?.required),
  };
}

/** Publishing requires a complete letter and budgets safe for all declared values. */
export function validateTemplatePublication(raw: unknown) {
  const result = prepareTemplateSource(raw);
  const { source } = result;
  const used = new Set(extractPlaceholders(source.bodyTemplate));
  const missing = REQUIRED_BODY_VARIABLES.filter((name) => !used.has(name));
  const errors: Record<string, string> = {};
  if (missing.length)
    errors.bodyTemplate = `Add these placeholders to the letter: ${missing.map((v) => `{{${v}}}`).join(", ")}.`;
  if (source.changeNotes.length < 10)
    errors.changeNotes =
      "Describe the change and what you checked (at least 10 characters).";
  const maximum = Object.fromEntries(
    TEMPLATE_VARIABLES.map((v) => [v.name, "x".repeat(v.maxLength)])
  );
  try {
    const rendered = renderTemplate(source.subjectTemplate, source.bodyTemplate, maximum);
    if (rendered.body.length > 100_000)
      errors.bodyTemplate =
        "The rendered letter can exceed 100,000 characters. Remove repeated variables or shorten the text.";
  } catch {
    errors.subjectTemplate =
      "The subject can exceed 200 characters with supported values. Shorten it or use fewer placeholders.";
  }
  if (Object.keys(errors).length)
    throw new ValidationError("This draft needs changes before publication.", {
      fieldErrors: errors,
    });
  return result;
}
