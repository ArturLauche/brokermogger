import { z } from "zod";
import { ValidationError } from "@/lib/core/errors";
import { normaliseForIndex } from "@/lib/security/crypto";
import { parseWithSchema } from "@/lib/validation/form";
import {
  MAX_ONBOARDING_IDENTIFIERS,
  MAX_ONBOARDING_IDENTIFIER_TEXT_LENGTH,
} from "./limits";

const fields = [
  ["previousNames", "PREVIOUS_NAME"],
  ["extraEmails", "EMAIL"],
  ["phones", "PHONE"],
  ["location", "APPROXIMATE_LOCATION"],
] as const;
export type AdditionalIdentifierField = (typeof fields)[number][0];
type AdditionalIdentifierType = (typeof fields)[number][1];
const boundedText = z
  .string()
  .max(
    MAX_ONBOARDING_IDENTIFIER_TEXT_LENGTH,
    "This field is too long. Add up to 30 matching details per save, one per line."
  );
const schema = z.object({
  previousNames: boundedText,
  extraEmails: boundedText,
  phones: boundedText,
  location: boundedText,
});

/** Bound raw text before allocating lines, and match persistence's equality rules. */
export function parseAdditionalOnboardingIdentifiers(raw: unknown) {
  const input = parseWithSchema(schema, raw);
  const identifiers: { type: AdditionalIdentifierType; value: string }[] = [];
  const sources: AdditionalIdentifierField[] = [];
  const seen = new Set<string>();
  for (const [field, type] of fields) {
    for (const line of input[field].split("\n")) {
      const value = line.trim();
      if (!value) continue;
      const key = `${type}:${normaliseForIndex(value, type === "EMAIL" ? "email" : type === "PHONE" ? "phone" : "text")}`;
      if (seen.has(key)) continue;
      if (identifiers.length === MAX_ONBOARDING_IDENTIFIERS) {
        throw new ValidationError(
          "Add no more than 30 distinct matching details per save.",
          {
            fieldErrors: { [field]: "Save these details in groups of up to 30." },
          }
        );
      }
      seen.add(key);
      identifiers.push({ type, value });
      sources.push(field);
    }
  }
  return { identifiers, sources };
}
