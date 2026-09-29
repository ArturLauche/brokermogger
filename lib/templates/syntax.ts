import {
  detectSuspiciousContent,
  stripControlCharacters,
  stripInvisible,
} from "@/lib/security/sanitize";
import { extractPlaceholders, isKnownVariable, PLACEHOLDER_PATTERN } from "./variables";

/** Plain-text grammar shared by authoring and rendering, including legacy sources. */
export function templateSyntaxErrors(subject: string, body: string) {
  const errors: Record<string, string> = {};
  for (const [field, source] of Object.entries({
    subjectTemplate: subject,
    bodyTemplate: body,
  })) {
    if (stripInvisible(stripControlCharacters(source)) !== source)
      errors[field] = "Remove invisible Unicode and unsupported control characters.";
    else if (field === "subjectTemplate" && /[\r\n]/.test(source))
      errors[field] = "The subject must be a single line.";
    else if (/\{\{|\}\}/.test(source.replace(PLACEHOLDER_PATTERN, "")))
      errors[field] =
        "Use complete placeholders in the form {{variable.name}}; expressions are not supported.";
    else if (extractPlaceholders(source).some((name) => !isKnownVariable(name)))
      errors[field] = "Use only placeholders from the variable reference below.";
    else if (
      detectSuspiciousContent(source).length ||
      /<\/?[a-z][a-z0-9:-]*(?:\s[^<>]*|\/?)>/i.test(source)
    )
      errors[field] = "Use plain text without HTML, scripts or email header lines.";
  }
  return errors;
}
