import { describe, expect, it } from "vitest";

import { isAppError } from "@/lib/core/errors";
import { renderTemplate } from "@/lib/templates/renderer";
import { LEGAL_RULES } from "../../../prisma/seeds/data/legal-rules";
import { REQUEST_TEMPLATES } from "../../../prisma/seeds/data/templates";

const context = {
  "profile.fullName": "Alex Sample",
  "profile.email": "alex.sample@example.org",
  "profile.country": "Germany",
  "request.type": "deletion",
  "request.legalBasis": "Article 17 of the GDPR",
  "request.reference": "BM-TEST01",
  "broker.name": "Example People Search",
  "identifiers.list": "- Email address: alex.sample@example.org",
  "reply.address": "alex.sample@example.org",
  today: "2026-08-15",
};

describe("renderTemplate", () => {
  it("renders every published seeded rule with each applicable template", () => {
    let combinations = 0;
    for (const rule of LEGAL_RULES) {
      for (const version of rule.versions.filter((item) => item.status === "PUBLISHED")) {
        for (const template of REQUEST_TEMPLATES.filter(
          (item) =>
            item.version.status === "PUBLISHED" &&
            version.supportedRequestTypes.includes(item.requestType) &&
            (!item.jurisdictionCode || item.jurisdictionCode === rule.jurisdictionCode)
        )) {
          const rendered = renderTemplate(
            template.version.subjectTemplate,
            template.version.bodyTemplate,
            { ...context, "request.legalBasis": version.legalBasisText }
          );
          expect(rendered.body).toContain(version.legalBasisText);
          expect(rendered.body).not.toContain("{{");
          combinations += 1;
        }
      }
    }
    expect(combinations).toBeGreaterThan(16);
  });

  it("enforces each variable's budget and the completed subject independently", () => {
    expect(() =>
      renderTemplate("Request", "{{profile.fullName}}", {
        ...context,
        "profile.fullName": "a".repeat(121),
      })
    ).toThrow();
    expect(() =>
      renderTemplate("{{request.legalBasis}}", "Body", {
        ...context,
        "request.legalBasis": "a".repeat(250),
      })
    ).toThrow();
  });

  it("is deterministic and hashes the exact text", () => {
    const template = {
      subject: "Privacy request {{request.reference}} for {{broker.name}}",
      body: "I am {{profile.fullName}}.\n{{identifiers.list}}\nUnder {{request.legalBasis}}.",
    };
    const first = renderTemplate(template.subject, template.body, context);
    const second = renderTemplate(template.subject, template.body, context);
    expect(first.body).toBe(second.body);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.subject).toContain("BM-TEST01");
    expect(first.body).toContain("Alex Sample");
  });

  it("rejects unknown placeholders", () => {
    try {
      renderTemplate("Hello {{injected.header}}", "Body", context);
      throw new Error("expected failure");
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.code).toBe("TEMPLATE_RENDER_FAILED");
      }
    }
  });

  it("rejects a newline in an inline value that would break email headers", () => {
    expect(() =>
      renderTemplate("Hello {{profile.fullName}}", "Body {{profile.email}}", {
        ...context,
        "profile.fullName": "Alex\r\nBcc: evil@example.com",
      })
    ).toThrow();
  });

  it("rejects script-like input instead of copying it into the letter", () => {
    expect(() =>
      renderTemplate("Request {{request.reference}}", "Name: {{profile.fullName}}", {
        ...context,
        "profile.fullName": "Alex <script>alert(1)</script>",
      })
    ).toThrow();
  });

  it("omits missing optional blocks instead of leaking placeholders", () => {
    const rendered = renderTemplate(
      "Request {{request.reference}}",
      "Hello.\n{{consent.statement}}\nThanks.",
      context
    );
    expect(rendered.body).not.toContain("{{consent.statement}}");
    expect(rendered.missingOptional).toContain("consent.statement");
  });
});
