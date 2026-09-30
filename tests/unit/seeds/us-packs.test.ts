import { describe, expect, it } from "vitest";

import { deadlinePolicySchema } from "@/lib/jurisdiction/deadlines";
import { LEGAL_RULES } from "@/prisma/seeds/data/legal-rules";
import { JURISDICTIONS } from "@/prisma/seeds/data/jurisdictions";
import { FUTURE_US_PRIVACY_PACKS } from "@/lib/jurisdiction/futureUs";
import { REQUEST_TEMPLATES } from "@/prisma/seeds/data/templates";

const STATES = [
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "IN",
  "IA",
  "KY",
  "MD",
  "MN",
  "MT",
  "NE",
  "NH",
  "NJ",
  "OR",
  "RI",
  "TN",
  "TX",
  "UT",
  "VA",
];
const currentVersion = (region: string) =>
  LEGAL_RULES.find((rule) => rule.jurisdictionCode === `US-${region}`)?.versions[0];

describe("sourced US state coverage", () => {
  it("resolves all 20 supported states through their own explicit jurisdiction", () => {
    const regions = JURISDICTIONS.filter(
      (row) => row.countryCode === "US" && row.region
    ).map((row) => row.region);
    expect(regions.sort()).toEqual(
      [...STATES, ...FUTURE_US_PRIVACY_PACKS.map((pack) => pack.region)].sort()
    );
    for (const region of STATES) expect(currentVersion(region)).toBeDefined();
  });

  it("does not assign statutory deletion or correction to the unsupported-state fallback", () => {
    for (const rule of LEGAL_RULES.filter((row) => row.jurisdictionCode === "US-OTHER")) {
      expect(rule.key).not.toBe("us-state-privacy-rights");
      for (const version of rule.versions) {
        expect(version.supportedRequestTypes).not.toContain("DELETION");
        expect(version.supportedRequestTypes).not.toContain("CORRECTION");
        expect(version.deadlineDays).toBeNull();
      }
    }
  });

  it("keeps Iowa's narrower rights and 90-day initial period distinct", () => {
    const version = currentVersion("IA");
    expect(version?.supportedRequestTypes).not.toContain("CORRECTION");
    expect(version?.riskNotes).toMatch(/provided.*consumer/i);
    expect(deadlinePolicySchema.parse(version?.deadlineRule.policy)).toMatchObject({
      period: 90,
      unit: "CALENDAR_DAYS",
      startsFrom: "RECEIPT",
      extension: { period: 45 },
    });
  });

  it("keeps Florida's narrow coverage and 15-day conditional extension distinct", () => {
    const version = currentVersion("FL");
    expect(version?.riskNotes).toMatch(/billion/i);
    expect(deadlinePolicySchema.parse(version?.deadlineRule.policy)).toMatchObject({
      period: 45,
      extension: { period: 15 },
    });
  });

  it("includes Utah's enacted correction right without extending its provided-data deletion scope", () => {
    const version = currentVersion("UT");
    expect(version?.supportedRequestTypes).toContain("CORRECTION");
    expect(version?.riskNotes).toMatch(/provided.*consumer/i);
    expect(
      version?.additionalSources.some((source) => source.url.includes("HB0418"))
    ).toBe(true);
  });

  it("keeps future changes separately reviewed and scheduled", () => {
    for (const [region, effectiveFrom] of [
      ["CT", "2026-10-01T04:00:00.000Z"],
      ["DE", "2027-01-01T05:00:00.000Z"],
      ["UT", "2027-01-01T07:00:00.000Z"],
    ]) {
      const rule = LEGAL_RULES.find((row) => row.jurisdictionCode === `US-${region}`);
      expect(
        rule?.versions.some((version) => version.effectiveFrom === effectiveFrom)
      ).toBe(true);
      expect(
        rule?.versions.every(
          (version) => version.lastReviewedAt === "2026-09-30T00:00:00.000Z"
        )
      ).toBe(true);
    }
  });

  it.each(FUTURE_US_PRIVACY_PACKS)(
    "keeps enacted $region law and letters unpublished while preserving voluntary requests",
    (pack) => {
      const rules = LEGAL_RULES.filter(
        (rule) => rule.jurisdictionCode === `US-${pack.region}`
      );
      const statutory = rules.find((rule) =>
        rule.key.endsWith("consumer-privacy-rights")
      );
      expect(statutory?.versions).toHaveLength(1);
      expect(statutory?.versions[0]).toMatchObject({
        status: "DRAFT",
        sourceUrl: pack.sourceUrl,
        effectiveFrom: pack.effectiveFrom,
        lastReviewedAt: "2026-10-01T00:00:00.000Z",
        requiresLegalReview: true,
        confidence: "LOW",
      });
      expect(
        deadlinePolicySchema.parse(statutory?.versions[0]?.deadlineRule.policy)
      ).toMatchObject({ period: 45, unit: "CALENDAR_DAYS", startsFrom: "RECEIPT" });
      const published = rules.flatMap((rule) =>
        rule.versions.filter((version) => version.status === "PUBLISHED")
      );
      expect(published).toHaveLength(1);
      expect(published[0]?.supportedRequestTypes).toEqual([
        "OPT_OUT",
        "SUPPRESSION",
        "FOLLOW_UP",
        "FINAL_REMINDER",
      ]);
      expect(published[0]?.deadlineDays).toBeNull();
      expect(published[0]?.legalBasisText).toMatch(/voluntary/i);
      const templates = REQUEST_TEMPLATES.filter(
        (template) => template.jurisdictionCode === `US-${pack.region}`
      );
      expect(templates).toHaveLength(4);
      expect(templates.every((template) => template.version.status === "DRAFT")).toBe(
        true
      );
    }
  );
});
