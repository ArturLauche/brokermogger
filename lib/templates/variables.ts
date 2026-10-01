/**
 * Canonical template variable catalogue.
 *
 * Templates may only reference variables listed here. The renderer rejects
 * unknown placeholders, so seeds, the admin template editor and the request
 * generator all agree on the same vocabulary.
 *
 * Placeholder syntax in templates: {{variable.name}}
 * There is no logic, no loops and no expressions - rendering is a pure,
 * deterministic substitution with escaping.
 */
import { z } from "zod";

export type VariableKind = "inline" | "block" | "date";

export interface TemplateVariableDefinition {
  name: string;
  kind: VariableKind;
  required: boolean;
  description: string;
  /** Maximum length after sanitisation. */
  maxLength: number;
  /** Example used in the admin preview. Never real personal data. */
  example: string;
}

export const TEMPLATE_VARIABLES: readonly TemplateVariableDefinition[] = [
  {
    name: "profile.fullName",
    kind: "inline",
    required: true,
    description: "Legal name of the person the request is made for.",
    maxLength: 120,
    example: "Alex Sample",
  },
  {
    name: "profile.email",
    kind: "inline",
    required: true,
    description: "Contact address the broker should reply to for this profile.",
    maxLength: 254,
    example: "alex.sample@example.org",
  },
  {
    name: "profile.region",
    kind: "inline",
    required: false,
    description: "State, province or region of residence.",
    maxLength: 80,
    example: "California",
  },
  {
    name: "profile.country",
    kind: "inline",
    required: true,
    description: "Country of residence, spelled out.",
    maxLength: 80,
    example: "United States",
  },
  {
    name: "request.type",
    kind: "inline",
    required: true,
    description: "Human readable request type, e.g. deletion or access.",
    maxLength: 60,
    example: "deletion",
  },
  {
    name: "request.legalBasis",
    kind: "inline",
    required: true,
    description: "Legal basis sentence taken from the applied legal rule version.",
    maxLength: 400,
    example: "the California Consumer Privacy Act as amended by the CPRA",
  },
  {
    name: "request.deadlineDate",
    kind: "date",
    required: false,
    description:
      "Response target date, ISO formatted and marked as an estimate when receipt or timing is uncertain.",
    maxLength: 30,
    example: "2026-09-30",
  },
  {
    name: "request.reference",
    kind: "inline",
    required: true,
    description: "Reference code so the broker and the user can correlate replies.",
    maxLength: 40,
    example: "BM-1234567890ABCDEF1234567890ABCDEF",
  },
  {
    name: "broker.name",
    kind: "inline",
    required: true,
    description: "Broker trading name as addressed in the message.",
    maxLength: 200,
    example: "Example People Search",
  },
  {
    name: "broker.legalName",
    kind: "inline",
    required: false,
    description: "Registered legal entity name, when known.",
    maxLength: 200,
    example: "Example People Search LLC",
  },
  {
    name: "identifiers.list",
    kind: "block",
    required: true,
    description:
      "Bullet list of the identifiers the user approved for matching. One per line.",
    maxLength: 1200,
    example: "- Full name: Alex Sample\n- Email address: alex.sample@example.org",
  },
  {
    name: "consent.statement",
    kind: "block",
    required: false,
    description:
      "Statement that the sender acts for another adult with documented consent.",
    maxLength: 600,
    example:
      "This request is submitted on behalf of the named individual with their documented consent (reference BM-CONSENT-19AF).",
  },
  {
    name: "reply.address",
    kind: "inline",
    required: true,
    description: "Address the broker should reply to.",
    maxLength: 254,
    example: "privacy-replies@example.org",
  },
  {
    name: "today",
    kind: "date",
    required: true,
    description: "Date the request was rendered, ISO formatted.",
    maxLength: 30,
    example: "2026-08-15",
  },
] as const;

export type TemplateVariableName = (typeof TEMPLATE_VARIABLES)[number]["name"];

export const TEMPLATE_VARIABLE_NAMES: readonly string[] = TEMPLATE_VARIABLES.map(
  (variable) => variable.name
);

const VARIABLE_MAP = new Map(
  TEMPLATE_VARIABLES.map((variable) => [variable.name, variable])
);

export function getVariableDefinition(
  name: string
): TemplateVariableDefinition | undefined {
  return VARIABLE_MAP.get(name);
}

export function isKnownVariable(name: string): boolean {
  return VARIABLE_MAP.has(name);
}

/** Matches {{variable.name}} with optional surrounding whitespace. */
export const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}/g;

export function extractPlaceholders(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found].sort();
}

/**
 * Values handed to the renderer. Every value is a plain string that has already
 * been sanitised; the renderer sanitises again as defence in depth.
 */
export const renderContextSchema = z.record(z.string(), z.string());

export type RenderContext = z.infer<typeof renderContextSchema>;
