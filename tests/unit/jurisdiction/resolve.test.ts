import { describe, expect, it } from "vitest";

import { resolveJurisdiction } from "@/lib/jurisdiction/resolve";
import type { JurisdictionRecord, LegalRuleSnapshot } from "@/lib/jurisdiction/types";
import { GDPR_COUNTRIES } from "@/lib/jurisdiction/eea";

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

  it("does not borrow Germany's authority when the actual country pack is missing", () => {
    expect(() =>
      resolveJurisdiction(
        { countryCode: "FR", region: null, residencyConfirmed: true },
        jurisdictions,
        [rule({ jurisdictionId: "j-de" })]
      )
    ).toThrow(/not in the shipped jurisdiction packs/);
  });

  it("prefers a supported US state over voluntary fallback regardless of row order", () => {
    const texas: JurisdictionRecord = {
      id: "j-tx",
      code: "US-TX",
      name: "Texas",
      countryCode: "US",
      region: "TX",
      isActive: true,
    };
    const resolved = resolveJurisdiction(
      { countryCode: "US", region: "tx", residencyConfirmed: true },
      [...jurisdictions, texas],
      [rule({ jurisdictionId: texas.id })]
    );
    expect(resolved.jurisdiction.code).toBe("US-TX");
    expect(resolved.availableRequestTypes).toContain("DELETION");
    expect(resolved.notes).toEqual([]);
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

  it.each(GDPR_COUNTRIES)("resolves $name to its own pack and rules", (country) => {
    const record: JurisdictionRecord = {
      id: `j-${country.code}`,
      code: country.code,
      name: country.name,
      countryCode: country.code,
      region: null,
      isActive: true,
    };
    const available = [
      ...jurisdictions.filter((entry) => entry.code !== country.code),
      record,
    ];
    const resolved = resolveJurisdiction(
      { countryCode: country.code.toLowerCase(), region: null, residencyConfirmed: true },
      available,
      [rule({ jurisdictionId: record.id })]
    );
    expect(resolved.jurisdiction.code).toBe(country.code);
    expect(resolved.rules).toHaveLength(1);
    expect(resolved.rules[0]?.jurisdictionId).toBe(record.id);
    expect(resolved.notes).toEqual([]);
  });
});
