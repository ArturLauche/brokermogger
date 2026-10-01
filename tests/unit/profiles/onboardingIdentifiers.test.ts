import { describe, expect, it } from "vitest";
import { parseAdditionalOnboardingIdentifiers } from "@/lib/profiles/onboardingIdentifiers";
import { MAX_ONBOARDING_IDENTIFIER_TEXT_LENGTH } from "@/lib/profiles/limits";
import { identifierInputSchema } from "@/lib/profiles/validation";
import { parseWithSchema } from "@/lib/validation/form";

const empty = { previousNames: "", extraEmails: "", phones: "", location: "" };

describe("onboarding text boundary", () => {
  it("accepts optional blanks and preserves field order for validation errors", () => {
    expect(parseAdditionalOnboardingIdentifiers(empty)).toEqual({
      identifiers: [],
      sources: [],
    });
    const result = parseAdditionalOnboardingIdentifiers({
      ...empty,
      previousNames: " Former Name \n\n",
      extraEmails: "invalid",
      phones: "+1 202 555 0123",
      location: "Berlin",
    });
    expect(result.sources).toEqual([
      "previousNames",
      "extraEmails",
      "phones",
      "location",
    ]);
    expect(result.identifiers[0]).toEqual({
      type: "PREVIOUS_NAME",
      value: "Former Name",
    });
    expect(() => parseWithSchema(identifierInputSchema, result.identifiers[1])).toThrow();
  });

  it("deduplicates with the same case, spacing and phone normalization as storage", () => {
    const result = parseAdditionalOnboardingIdentifiers({
      previousNames: "Former  Name\nformer name",
      extraEmails: "ALEX@example.org\nalex@example.org",
      phones: "+1 (202) 555-0123\n+12025550123",
      location: "Former Name",
    });
    expect(result.identifiers).toHaveLength(4);
    expect(result.sources).toEqual([
      "previousNames",
      "extraEmails",
      "phones",
      "location",
    ]);
  });

  it("accepts all 30 full-length identifiers without an accidental textarea limit", () => {
    const values = Array.from({ length: 30 }, (_, i) =>
      `Former Name ${i}`.padEnd(200, "x")
    );
    const result = parseAdditionalOnboardingIdentifiers({
      ...empty,
      previousNames: values.join("\n"),
    });
    expect(result.identifiers).toHaveLength(30);
    for (const identifier of result.identifiers)
      expect(identifierInputSchema.safeParse(identifier).success).toBe(true);
  });

  it("reports the field that exceeds the shared distinct limit across all textareas", () => {
    expect(() =>
      parseAdditionalOnboardingIdentifiers({
        ...empty,
        extraEmails: Array.from({ length: 29 }, (_, i) => `alex${i}@example.org`).join(
          "\n"
        ),
        phones: "+12025550123\n+12025550124",
      })
    ).toThrowError(
      expect.objectContaining({
        code: "VALIDATION_FAILED",
        details: { fieldErrors: { phones: expect.any(String) } },
      })
    );
  });

  it("rejects excessive raw text before splitting a large number of empty lines", () => {
    expect(() =>
      parseAdditionalOnboardingIdentifiers({
        ...empty,
        extraEmails: "\n".repeat(MAX_ONBOARDING_IDENTIFIER_TEXT_LENGTH + 1),
      })
    ).toThrowError(
      expect.objectContaining({
        code: "VALIDATION_FAILED",
        details: expect.objectContaining({
          fieldErrors: { extraEmails: expect.any(String) },
        }),
      })
    );
  });
});
