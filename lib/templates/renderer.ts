/**
 * Deterministic request template renderer.
 *
 * Templates are plain text with `{{variable.name}}` placeholders. There is no
 * logic, looping or HTML interpolation. Every substitution is sanitised again
 * even if the caller already cleaned the value, so a missed check cannot leak
 * a newline into a subject or a script tag into a body.
 *
 * The function is pure: the same template and context always produce the same
 * subject, body, hash and placeholder list. That hash is what the approval
 * screen later compares against.
 */
import { AppError } from "@/lib/core/errors";
import { templateSyntaxErrors } from "./syntax";
import { sha256Hex } from "@/lib/security/crypto";
import {
  detectSuspiciousContent,
  escapeHtml,
  sanitiseHeaderValue,
  sanitiseText,
} from "@/lib/security/sanitize";

import {
  extractPlaceholders,
  getVariableDefinition,
  isKnownVariable,
  PLACEHOLDER_PATTERN,
  type RenderContext,
} from "./variables";

export interface RenderedTemplate {
  subject: string;
  body: string;
  /** SHA-256 of subject + newline + body. Stored on RequestSnapshot.contentHash. */
  contentHash: string;
  placeholders: string[];
  missingOptional: string[];
  suspicious: string[];
}

export interface RenderOptions {
  /** Extra unknown placeholders already rejected; this only relaxes missing optionals. */
  allowMissingOptional?: boolean;
}

function substitute(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    return values[name] ?? "";
  });
}

function sanitiseVariable(
  name: string,
  raw: string
): { value: string; suspicious: string[] } {
  const definition = getVariableDefinition(name);
  if (!definition) {
    throw new AppError({
      code: "TEMPLATE_RENDER_FAILED",
      message: "The template refers to a variable this product does not support.",
      details: { variable: name },
    });
  }

  const suspicious = detectSuspiciousContent(raw);
  const multiline = definition.kind === "block";
  const value =
    definition.kind === "inline" || definition.kind === "date"
      ? sanitiseHeaderValue(raw, name, definition.maxLength)
      : sanitiseText(raw, {
          multiline,
          maxLength: definition.maxLength,
          fieldName: name,
        });

  return { value, suspicious };
}

/**
 * Renders a subject and body. Throws `TEMPLATE_RENDER_FAILED` for unknown
 * placeholders and for missing required variables. Optional variables that are
 * absent are replaced with an empty string so that leftover `{{consent.statement}}`
 * lines do not leak into the letter.
 */
export function renderTemplate(
  subjectTemplate: string,
  bodyTemplate: string,
  context: RenderContext,
  options: RenderOptions = {}
): RenderedTemplate {
  const fieldErrors = templateSyntaxErrors(subjectTemplate, bodyTemplate);
  if (Object.keys(fieldErrors).length)
    throw new AppError({
      code: "TEMPLATE_RENDER_FAILED",
      message: "The template contains unsupported or unsafe syntax.",
      details: { fieldErrors },
    });
  const placeholders = [
    ...new Set([
      ...extractPlaceholders(subjectTemplate),
      ...extractPlaceholders(bodyTemplate),
    ]),
  ].sort();

  const unknown = placeholders.filter((name) => !isKnownVariable(name));
  if (unknown.length > 0) {
    throw new AppError({
      code: "TEMPLATE_RENDER_FAILED",
      message:
        "The template contains placeholders that are not in the allowed catalogue.",
      details: { unknown },
    });
  }

  const values: Record<string, string> = {};
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const suspicious: string[] = [];

  for (const name of placeholders) {
    const definition = getVariableDefinition(name);
    if (!definition) continue;

    const raw = context[name];
    if (raw === undefined || raw.trim() === "") {
      if (definition.required) {
        missingRequired.push(name);
      } else {
        missingOptional.push(name);
        values[name] = "";
      }
      continue;
    }

    const cleaned = sanitiseVariable(name, raw);
    values[name] = cleaned.value;
    for (const label of cleaned.suspicious) {
      if (!suspicious.includes(label)) suspicious.push(label);
    }
  }

  if (suspicious.length > 0) {
    throw new AppError({
      code: "UNSAFE_INPUT",
      message: "A value contains content that is not allowed in a broker request.",
      details: { suspicious },
    });
  }

  if (missingRequired.length > 0) {
    throw new AppError({
      code: "TEMPLATE_RENDER_FAILED",
      message: "The template is missing required values.",
      details: { missingRequired },
    });
  }

  if (missingOptional.length > 0 && options.allowMissingOptional === false) {
    throw new AppError({
      code: "TEMPLATE_RENDER_FAILED",
      message: "Optional template values were required by the caller and are missing.",
      details: { missingOptional },
    });
  }

  const subject = sanitiseHeaderValue(
    substitute(subjectTemplate, values).trim(),
    "subject"
  );
  const body = collapseEmptyLines(substitute(bodyTemplate, values)).trim();

  return {
    subject,
    body,
    contentHash: sha256Hex(`${subject}\n${body}`),
    placeholders,
    missingOptional,
    suspicious,
  };
}

function collapseEmptyLines(value: string): string {
  return value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

/** Escaped HTML preview of a rendered plain-text body. Never used for broker mail. */
export function bodyAsEscapedHtml(body: string): string {
  return escapeHtml(body).replace(/\n/g, "<br />\n");
}
