/**
 * Template guard rails.
 *
 * The renderer rejects unknown placeholders, so a template that references a
 * variable outside `lib/templates/variables.ts` would fail at request time.
 * These tests catch that at build time, together with the editorial rules:
 * plain text only, a reply address, a reference code and a request for
 * confirmation in every message.
 */
import { describe, expect, it } from "vitest";

import {
  extractPlaceholders,
  getVariableDefinition,
  isKnownVariable,
} from "@/lib/templates/variables";
import { templateChecksum } from "@/prisma/seeds/checksum";
import { isKnownClause, TEMPLATE_CLAUSE_KEYS } from "@/prisma/seeds/data/clauses";
import { JURISDICTIONS } from "@/prisma/seeds/data/jurisdictions";
import { REQUEST_TEMPLATES } from "@/prisma/seeds/data/templates";

const ALL_REQUEST_TYPES = [
  "DELETION",
  "ACCESS",
  "CORRECTION",
  "OBJECTION",
  "OPT_OUT",
  "SUPPRESSION",
  "CONSENT_WITHDRAWAL",
  "FOLLOW_UP",
  "FINAL_REMINDER",
  "ESCALATION",
] as const;

const JURISDICTION_VARIANTS = ["US-CA", "DE", "GB", "BR", "AU", "SG"];

function fullText(index: number): string {
  const template = REQUEST_TEMPLATES[index];
  if (!template) throw new Error(`no template at index ${index}`);
  return `${template.version.subjectTemplate}\n${template.version.bodyTemplate}`;
}

describe("request template seed data", () => {
  it("uses unique keys", () => {
    const keys = REQUEST_TEMPLATES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("provides a generic template for every request type", () => {
    for (const requestType of ALL_REQUEST_TYPES) {
      const generic = REQUEST_TEMPLATES.filter(
        (template) =>
          template.requestType === requestType && template.jurisdictionCode === undefined
      );
      expect(generic.length, `missing generic template for ${requestType}`).toBe(1);
    }
  });

  it("provides jurisdiction specific variants for the documented jurisdictions", () => {
    for (const code of JURISDICTION_VARIANTS) {
      const variants = REQUEST_TEMPLATES.filter(
        (template) => template.jurisdictionCode === code
      );
      expect(variants.length, `missing variants for ${code}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("references only known jurisdictions", () => {
    const codes = new Set(JURISDICTIONS.map((jurisdiction) => jurisdiction.code));
    for (const template of REQUEST_TEMPLATES) {
      if (template.jurisdictionCode !== undefined) {
        expect(codes.has(template.jurisdictionCode)).toBe(true);
      }
    }
  });

  it("uses only placeholders from the canonical variable catalogue", () => {
    for (const [index, template] of REQUEST_TEMPLATES.entries()) {
      for (const placeholder of extractPlaceholders(fullText(index))) {
        expect(
          isKnownVariable(placeholder),
          `${template.key} uses unknown placeholder ${placeholder}`
        ).toBe(true);
      }
    }
  });

  it("declares exactly the variables it uses", () => {
    for (const [index, template] of REQUEST_TEMPLATES.entries()) {
      const used = extractPlaceholders(fullText(index)).sort();
      const declared = [
        ...template.version.requiredVariables,
        ...template.version.optionalVariables,
      ].sort();

      expect(declared, `${template.key} declaration mismatch`).toEqual(used);
      expect(new Set(declared).size, `${template.key} declares a duplicate`).toBe(
        declared.length
      );
    }
  });

  it("never declares a mandatory variable as optional", () => {
    for (const template of REQUEST_TEMPLATES) {
      for (const name of template.version.optionalVariables) {
        expect(
          getVariableDefinition(name)?.required,
          `${template.key} declares ${name} optional`
        ).toBe(false);
      }
    }
  });

  it("contains the mandatory building blocks in every body", () => {
    for (const template of REQUEST_TEMPLATES) {
      const body = template.version.bodyTemplate;
      expect(body, `${template.key} misses the legal basis`).toContain(
        "{{request.legalBasis}}"
      );
      expect(body, `${template.key} misses the identifier list`).toContain(
        "{{identifiers.list}}"
      );
      expect(body, `${template.key} misses the reply address`).toContain(
        "{{reply.address}}"
      );
      expect(body, `${template.key} misses the reference`).toContain(
        "{{request.reference}}"
      );
      expect(body, `${template.key} misses the request type`).toContain(
        "{{request.type}}"
      );
      expect(body, `${template.key} misses a confirmation request`).toMatch(/confirm/i);
    }
  });

  it("offers the household consent block as an optional variable", () => {
    for (const template of REQUEST_TEMPLATES) {
      expect(template.version.optionalVariables).toContain("consent.statement");
      expect(template.version.bodyTemplate).toContain("{{consent.statement}}");
      expect(template.clauses).toContain("household-consent-statement");
    }
  });

  it("stays plain text without markup or emojis", () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

    for (const template of REQUEST_TEMPLATES) {
      const text = `${template.version.subjectTemplate}\n${template.version.bodyTemplate}`;
      expect(text, `${template.key} contains a tag`).not.toMatch(/<[a-zA-Z/!][^>]*>/);
      expect(text, `${template.key} contains an HTML entity`).not.toMatch(/&[a-z]+;/);
      expect(emoji.test(text), `${template.key} contains an emoji`).toBe(false);
    }
  });

  it("keeps subjects on a single line", () => {
    for (const template of REQUEST_TEMPLATES) {
      const subject = template.version.subjectTemplate;
      expect(subject, `${template.key} subject has a line break`).not.toMatch(/[\r\n]/);
      expect(subject.length).toBeGreaterThan(10);
      expect(subject.length).toBeLessThanOrEqual(160);
    }
  });

  it("avoids threats and guarantees", () => {
    const forbidden = [
      /guarantee/i,
      /we will sue/i,
      /legal action will/i,
      /permanently erased from the internet/i,
      /immediately or else/i,
    ];

    for (const template of REQUEST_TEMPLATES) {
      for (const pattern of forbidden) {
        expect(
          template.version.bodyTemplate,
          `${template.key} matched ${pattern}`
        ).not.toMatch(pattern);
      }
    }
  });

  it("publishes version 1 with an English locale", () => {
    for (const template of REQUEST_TEMPLATES) {
      expect(template.version.version).toBe(1);
      expect(template.version.status).toBe("PUBLISHED");
      expect(template.version.locale).toBe("en");
      expect(template.channel).toBe("EMAIL");
      expect(template.isActive).toBe(true);
    }
  });

  it("uses only known clause keys and covers the whole clause catalogue", () => {
    const used = new Set<string>();

    for (const template of REQUEST_TEMPLATES) {
      expect(template.clauses.length).toBeGreaterThan(0);
      for (const clause of template.clauses) {
        expect(
          isKnownClause(clause),
          `${template.key} uses unknown clause ${clause}`
        ).toBe(true);
        used.add(clause);
      }
    }

    for (const clause of TEMPLATE_CLAUSE_KEYS) {
      expect([...used], `clause ${clause} is never used`).toContain(clause);
    }
  });

  it("computes a stable checksum over subject and body", () => {
    const template = REQUEST_TEMPLATES[0];
    if (!template) throw new Error("no templates");

    const checksum = templateChecksum(
      template.version.subjectTemplate,
      template.version.bodyTemplate
    );

    expect(checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(
      templateChecksum(template.version.subjectTemplate, template.version.bodyTemplate)
    ).toBe(checksum);
    expect(
      templateChecksum(
        template.version.subjectTemplate,
        `${template.version.bodyTemplate} `
      )
    ).not.toBe(checksum);
  });

  it("does not promise a deletion outcome in the Australian and Singapore variants", () => {
    const restricted = REQUEST_TEMPLATES.filter(
      (template) =>
        template.jurisdictionCode === "AU" || template.jurisdictionCode === "SG"
    );

    expect(restricted.length).toBeGreaterThan(0);
    for (const template of restricted) {
      expect(template.requestType).not.toBe("DELETION");
    }
  });
});
