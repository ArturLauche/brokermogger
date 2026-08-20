import { describe, expect, it } from "vitest";

import { resolveJurisdiction } from "@/lib/jurisdiction/resolve";
import type { JurisdictionRecord, LegalRuleSnapshot } from "@/lib/jurisdiction/types";

const jurisdictions: JurisdictionRecord[] = [
  {
    id: "j-ca",
    code: "US-CA",
    name: "California",
    countryCode: "US",
    region: "CA",
    isActive: true,
  },
  {
    id: "j-us",
    code: "US-OTHER",
    name: "Other United States",
    countryCode: "US",
    region: null,
    isActive: true,
  },
  {
    id: "j-de",
    code: "DE",
    name: "Germany",
    countryCode: "DE",
    region: null,
    isActive: true,
  },
];

function rule(
  partial: Partial<LegalRuleSnapshot> & Pick<LegalRuleSnapshot, "jurisdictionId">
): LegalRuleSnapshot {
  return {
    legalRuleId: "r1",
    legalRuleVersionId: "v1",
    legalRuleKey: "test",
    lawName: "Test law",
    version: 1,
    supportedRequestTypes: ["DELETION", "ACCESS"],
    legalBasisText: "the test law",
    deadlineDays: 30,
    deadlineRule: {},
    verificationRequirements: {},
    escalationPath: "Ask the authority.",
    escalationAuthority: null,
    escalationUrl: null,
    templateClauses: [],
    riskNotes: "Unreviewed.",
    requiresLegalReview: true,
    confidence: "LOW",
    sourceUrl: "https://example.invalid",
    sourceTitle: "Example",
    lastReviewedAt: new Date("2026-01-01"),
    reviewedBy: "tests",
    ...partial,
  };
}

describe("resolveJurisdiction", () => {
  it("maps California residents to US-CA", () => {
    const resolved = resolveJurisdiction(
      { countryCode: "US", region: "CA", residencyConfirmed: true },
      jurisdictions,
      [
        rule({ jurisdictionId: "j-ca" }),
        rule({ jurisdictionId: "j-us", legalRuleKey: "other" }),
      ]
    );
    expect(resolved.jurisdiction.code).toBe("US-CA");
    expect(resolved.rules).toHaveLength(1);
  });

  it("does not assume a federal deletion right for other US states", () => {
    const resolved = resolveJurisdiction(
      { countryCode: "US", region: "TX", residencyConfirmed: true },
      jurisdictions,
      [rule({ jurisdictionId: "j-us" })]
    );
    expect(resolved.jurisdiction.code).toBe("US-OTHER");
    expect(resolved.notes.join(" ")).toMatch(/no uniform federal deletion right/i);
  });

  it("uses the Germany GDPR pack for other EU countries", () => {
    const resolved = resolveJurisdiction(
      { countryCode: "FR", region: null, residencyConfirmed: true },
      jurisdictions,
      [rule({ jurisdictionId: "j-de" })]
    );
    expect(resolved.jurisdiction.code).toBe("DE");
    expect(resolved.notes.join(" ")).toMatch(/GDPR/);
  });

  it("refuses to invent a pack when residency is not confirmed", () => {
    expect(() =>
      resolveJurisdiction(
        { countryCode: "DE", region: null, residencyConfirmed: false },
        jurisdictions,
        [rule({ jurisdictionId: "j-de" })]
      )
    ).toThrow();
  });
});
