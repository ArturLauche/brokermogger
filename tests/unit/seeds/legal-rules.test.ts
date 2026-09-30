/**
 * Guard rails for the seeded legal content.
 *
 * These tests encode the product rule that Brokermogger never claims a right
 * that a jurisdiction does not clearly provide, and that uncertain logic is
 * always flagged with a source, a review date and a confidence value.
 */
import { describe, expect, it } from "vitest";

import { isKnownClause } from "@/prisma/seeds/data/clauses";
import { JURISDICTIONS } from "@/prisma/seeds/data/jurisdictions";
import { LEGAL_RULES, type LegalRuleVersionSeed } from "@/prisma/seeds/data/legal-rules";
import { deadlinePolicySchema } from "@/lib/jurisdiction/deadlines";
import {
  GDPR_COUNTRIES,
  EDPB_AUTHORITY_DIRECTORY,
  EEA_GDPR_COMMENCEMENT_SOURCE,
} from "@/lib/jurisdiction/eea";

const ALL_VERSIONS: {
  ruleKey: string;
  jurisdiction: string;
  version: LegalRuleVersionSeed;
}[] = LEGAL_RULES.flatMap((rule) =>
  rule.versions.map((version) => ({
    ruleKey: rule.key,
    jurisdiction: rule.jurisdictionCode,
    version,
  }))
);

function versionsFor(jurisdictionCode: string): LegalRuleVersionSeed[] {
  return ALL_VERSIONS.filter((entry) => entry.jurisdiction === jurisdictionCode).map(
    (entry) => entry.version
  );
}

describe("legal rule seed data", () => {
  it("covers every seeded jurisdiction with at least one rule", () => {
    for (const jurisdiction of JURISDICTIONS) {
      const rules = LEGAL_RULES.filter(
        (rule) => rule.jurisdictionCode === jurisdiction.code
      );
      expect(rules.length, `no legal rule for ${jurisdiction.code}`).toBeGreaterThan(0);
    }
  });

  it("references only known jurisdictions and unique rule keys", () => {
    const codes = new Set(JURISDICTIONS.map((jurisdiction) => jurisdiction.code));
    const seen = new Set<string>();

    for (const rule of LEGAL_RULES) {
      expect(codes.has(rule.jurisdictionCode)).toBe(true);
      const key = `${rule.jurisdictionCode}/${rule.key}`;
      expect(seen.has(key), `duplicate rule key ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("publishes version 1 for every rule", () => {
    for (const rule of LEGAL_RULES) {
      expect(rule.versions.length).toBeGreaterThan(0);
      for (const version of rule.versions) {
        expect(version.version).toBeGreaterThanOrEqual(1);
        expect(version.status).toBe("PUBLISHED");
        expect(version.supportedRequestTypes.length).toBeGreaterThan(0);
      }
    }
  });

  it("flags low confidence versions for legal review", () => {
    for (const { ruleKey, version } of ALL_VERSIONS) {
      if (version.confidence === "LOW") {
        expect(version.requiresLegalReview, `${ruleKey} is LOW without review flag`).toBe(
          true
        );
      }
    }
  });

  it("carries a source, a title and a review date on every version", () => {
    for (const { ruleKey, version } of ALL_VERSIONS) {
      expect(version.sourceUrl, `${ruleKey} has no source URL`).toMatch(/^https:\/\//);
      expect(
        version.sourceTitle.length,
        `${ruleKey} has no source title`
      ).toBeGreaterThan(5);
      expect(Number.isNaN(Date.parse(version.lastReviewedAt))).toBe(false);
      expect(Date.parse(version.lastReviewedAt)).toBeGreaterThan(
        Date.parse(version.effectiveFrom)
      );
      expect(version.reviewedBy).toBe("Brokermogger maintainers, unreviewed by counsel");
      expect(version.riskNotes.length).toBeGreaterThan(40);
      expect(version.changeNotes.length).toBeGreaterThan(10);
    }
  });

  it("never claims more than medium confidence and reserves medium for GDPR", () => {
    for (const { jurisdiction, ruleKey, version } of ALL_VERSIONS) {
      expect(version.confidence, `${ruleKey} claims HIGH confidence`).not.toBe("HIGH");
      if (version.confidence === "MEDIUM") {
        expect(
          [...GDPR_COUNTRIES.map((country) => country.code), "GB"],
          `${ruleKey} claims MEDIUM outside GDPR`
        ).toContain(jurisdiction);
      }
      expect(version.requiresLegalReview).toBe(true);
    }
  });

  it("keeps deadlines inside the range the database accepts", () => {
    for (const { ruleKey, version } of ALL_VERSIONS) {
      if (version.deadlineDays === null) {
        expect(version.deadlineRule.baseDays, `${ruleKey} deadline mismatch`).toBeNull();
        continue;
      }
      expect(version.deadlineDays).toBeGreaterThanOrEqual(0);
      expect(version.deadlineDays).toBeLessThanOrEqual(365);
      expect(version.deadlineRule.baseDays).toBe(version.deadlineDays);
    }
  });

  it("uses only known template clause keys", () => {
    for (const { ruleKey, version } of ALL_VERSIONS) {
      for (const clause of version.templateClauses) {
        expect(isKnownClause(clause), `${ruleKey} uses unknown clause ${clause}`).toBe(
          true
        );
      }
    }
  });

  it("uses https escalation URLs where an authority exists", () => {
    for (const { version } of ALL_VERSIONS) {
      if (version.escalationUrl !== undefined) {
        expect(version.escalationUrl).toMatch(/^https:\/\//);
        expect(version.escalationAuthority).toBeDefined();
      }
      expect(version.escalationPath.length).toBeGreaterThan(40);
    }
  });

  it("does not claim a deletion right in Australia or Singapore", () => {
    for (const jurisdiction of ["AU", "SG"]) {
      for (const version of versionsFor(jurisdiction)) {
        expect(
          version.supportedRequestTypes,
          `${jurisdiction} must not claim deletion`
        ).not.toContain("DELETION");
        expect(version.confidence).toBe("LOW");
      }
    }
  });

  it("does not assume a uniform federal deletion right in the United States", () => {
    const rules = LEGAL_RULES.filter((rule) => rule.jurisdictionCode === "US-OTHER");
    expect(rules.length).toBeGreaterThanOrEqual(2);

    const stateRule = rules.find((rule) => rule.key === "us-state-privacy-rights");
    expect(stateRule?.versions[0]?.riskNotes).toMatch(
      /no uniform federal deletion right/i
    );

    const voluntary = rules.find((rule) => rule.key === "us-broker-voluntary-opt-out");
    expect(voluntary?.versions[0]?.supportedRequestTypes).not.toContain("DELETION");
    expect(voluntary?.versions[0]?.deadlineDays).toBeNull();
  });

  it("keeps the California deletion platform rule explicitly unverified", () => {
    const rule = LEGAL_RULES.find((entry) => entry.key === "ca-delete-act-drop");
    const version = rule?.versions[0];

    expect(rule?.jurisdictionCode).toBe("US-CA");
    expect(version?.confidence).toBe("LOW");
    expect(version?.requiresLegalReview).toBe(true);
    expect(version?.deadlineRule.verified).toBe(false);
    expect(version?.riskNotes).toMatch(/verified against current California Privacy/i);
    expect(version?.riskNotes).toMatch(/timing, eligibility, broker coverage/i);
  });

  it("routes India through an unverified commencement warning", () => {
    const version = versionsFor("IN")[0];
    expect(version?.confidence).toBe("LOW");
    expect(version?.riskNotes).toMatch(/commencement and rule making status/i);
    expect(version?.deadlineDays).toBeNull();
  });

  it("gives GDPR jurisdictions a one month deadline with an extension", () => {
    for (const jurisdiction of [...GDPR_COUNTRIES.map((country) => country.code), "GB"]) {
      for (const version of versionsFor(jurisdiction)) {
        expect(version.deadlineDays).toBeNull();
        expect(version.deadlineRule.extension.possible).toBe(true);
        expect(version.deadlineRule.extension.additionalDays).toBeNull();
        expect(deadlinePolicySchema.parse(version.deadlineRule.policy)).toMatchObject({
          unit: "CALENDAR_MONTHS",
          period: 1,
          startsFrom: "RECEIPT",
          extension: { unit: "CALENDAR_MONTHS", period: 2, noticeRequired: true },
        });
        expect(version.escalationAuthority).toBeDefined();
      }
    }
  });

  it("pins country authorities and the distinct EEA EFTA commencement without inventing local holidays", () => {
    for (const country of GDPR_COUNTRIES) {
      const versions = versionsFor(country.code);
      expect(versions).toHaveLength(2);
      for (const version of versions) {
        expect(version.escalationAuthority).toBe(country.authority);
        expect(version.escalationUrl).toBe(country.authorityUrl);
        expect(version.escalationPath).toContain(country.name);
        expect(version.riskNotes).toMatch(/national derogation/i);
        expect(version.additionalSources.map((source) => source.url)).toContain(
          EDPB_AUTHORITY_DIRECTORY
        );
        expect(version.deadlineRule.policy?.calendar).toBeNull();
        expect(version.lastReviewedAt).toBe("2026-09-30T00:00:00.000Z");
        expect(version.effectiveFrom).toBe(
          country.eeaEfta ? "2018-07-20T00:00:00.000Z" : "2018-05-25T00:00:00.000Z"
        );
        if (country.eeaEfta)
          expect(version.additionalSources.map((source) => source.url)).toContain(
            EEA_GDPR_COMMENCEMENT_SOURCE
          );
      }
    }
    expect(versionsFor("DE")[0]?.escalationPath).toMatch(/state and federal/);
  });
});
