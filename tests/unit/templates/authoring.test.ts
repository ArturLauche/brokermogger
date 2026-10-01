import { describe, expect, it } from "vitest";
import {
  prepareTemplateSource,
  validateTemplatePublication,
  DEFAULT_TEMPLATE_SOURCE,
} from "@/lib/templates/authoring";
import { templateSyntaxErrors } from "@/lib/templates/syntax";
import { renderTemplate } from "@/lib/templates/renderer";
import { REQUEST_TEMPLATES } from "@/prisma/seeds/data/templates";

const complete = {
  ...DEFAULT_TEMPLATE_SOURCE,
  changeNotes: "Checked all applicable clauses and synthetic previews.",
};
describe("template authoring", () => {
  it("validates every shipped letter against full supported value budgets", () => {
    for (const template of REQUEST_TEMPLATES) {
      const prepared = validateTemplatePublication(template.version);
      expect(prepared.preview.body, template.key).not.toContain("{{");
      expect(prepared.requiredVariables).toEqual(
        [...template.version.requiredVariables].sort()
      );
      expect(prepared.optionalVariables).toEqual(
        [...template.version.optionalVariables].sort()
      );
    }
  });
  it("previews self and household letters with synthetic data and derives declarations", () => {
    const prepared = prepareTemplateSource(complete);
    expect(prepared.selfPreview.body).toContain("Alex Sample");
    expect(prepared.selfPreview.body).not.toContain("documented consent");
    expect(prepared.preview.body).toContain("documented consent");
    expect(prepared.optionalVariables).toEqual(["consent.statement"]);
    expect(prepared.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(
      prepareTemplateSource({
        ...complete,
        bodyTemplate: complete.bodyTemplate + "\nA change.",
      }).checksum
    ).not.toBe(prepared.checksum);
  });
  it("normalizes browser and Windows line endings before checksums and previews", () => {
    const ordinary = prepareTemplateSource(complete);
    for (const separator of ["\r\n", "\r"]) {
      const browser = prepareTemplateSource({
        ...complete,
        bodyTemplate: complete.bodyTemplate.replaceAll("\n", separator),
      });
      expect(browser.source.bodyTemplate).toBe(complete.bodyTemplate);
      expect(browser.checksum).toBe(ordinary.checksum);
      expect(browser.selfPreview).toEqual(ordinary.selfPreview);
      expect(browser.selfPreview.body).not.toContain("\r");
    }
  });
  it("allows incomplete drafts but blocks incomplete publication and missing review notes", () => {
    const draft = {
      ...complete,
      bodyTemplate: "Hello {{profile.fullName}}",
      changeNotes: "",
    };
    expect(prepareTemplateSource(draft).preview.body).toBe("Hello Alex Sample");
    expect(() => validateTemplatePublication(draft)).toThrow(
      expect.objectContaining({
        code: "VALIDATION_FAILED",
        details: {
          fieldErrors: expect.objectContaining({
            bodyTemplate: expect.any(String),
            changeNotes: expect.any(String),
          }),
        },
      })
    );
  });
  it.each([
    "Hello {{unknown.name}}",
    "Hello {{ profile.fullName",
    "Hello {{profile.fullName.toUpperCase()}}",
    "Hello }}",
    "<b>Hello</b>",
    "Hello\u202Ehidden",
    "Hello\u0000control",
    "From: attacker@example.org",
  ])(
    "rejects unsupported source %s at both editor and renderer boundaries",
    (bodyTemplate) => {
      expect(() => prepareTemplateSource({ ...complete, bodyTemplate })).toThrow(
        expect.objectContaining({
          code: "VALIDATION_FAILED",
          details: expect.objectContaining({
            fieldErrors: { bodyTemplate: expect.any(String) },
          }),
        })
      );
      expect(() => renderTemplate("Request", bodyTemplate, {})).toThrow(
        expect.objectContaining({ code: "TEMPLATE_RENDER_FAILED" })
      );
    }
  );
  it("allows literal email addresses in angle brackets without mistaking them for HTML", () => {
    expect(
      templateSyntaxErrors(
        "Request",
        "Reply at <privacy@example.org>. Values {{profile.fullName}}."
      )
    ).toEqual({});
  });
  it("rejects multiline and oversized subjects with linked field errors", () => {
    for (const subjectTemplate of ["Hello\nBcc: bad@example.org", "x".repeat(201)])
      expect(() => prepareTemplateSource({ ...complete, subjectTemplate })).toThrow(
        expect.objectContaining({
          code: "VALIDATION_FAILED",
          details: expect.objectContaining({
            fieldErrors: { subjectTemplate: expect.any(String) },
          }),
        })
      );
  });
  it("requires a safe maximum subject even when the example preview fits", () => {
    const draft = { ...complete, subjectTemplate: "Request to {{broker.name}}" };
    expect(prepareTemplateSource(draft).preview.subject).toBe(
      "Request to Example People Search"
    );
    expect(() => validateTemplatePublication(draft)).toThrow(
      expect.objectContaining({
        details: expect.objectContaining({
          fieldErrors: { subjectTemplate: expect.any(String) },
        }),
      })
    );
  });
  it("links an empty self-preview subject to the editor field", () => {
    expect(() =>
      prepareTemplateSource({ ...complete, subjectTemplate: "{{profile.region}}" })
    ).toThrow(
      expect.objectContaining({
        code: "VALIDATION_FAILED",
        details: { fieldErrors: { subjectTemplate: expect.any(String) } },
      })
    );
  });
  it("rejects expansion beyond the supported body budget", () => {
    expect(() =>
      validateTemplatePublication({
        ...complete,
        bodyTemplate: complete.bodyTemplate + "\n{{identifiers.list}}".repeat(84),
      })
    ).toThrow(
      expect.objectContaining({
        details: { fieldErrors: { bodyTemplate: expect.any(String) } },
      })
    );
  });
});
