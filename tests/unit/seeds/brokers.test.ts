/**
 * Safety net for the demo broker records.
 *
 * The two rules that must never break: every record is clearly demo data, and
 * nothing in it can address a real recipient. Everything else in here keeps the
 * demonstration useful, for example the category and jurisdiction spread.
 */
import { describe, expect, it } from "vitest";

import { DEMO_BROKERS, type BrokerSeed } from "@/prisma/seeds/data/brokers";
import { JURISDICTIONS } from "@/prisma/seeds/data/jurisdictions";

const CATEGORY_MINIMUM = 4;
const JURISDICTION_MINIMUMS: Record<string, number> = {
  "US-CA": 10,
  DE: 10,
  GB: 8,
  BR: 5,
  IN: 5,
  AU: 5,
  SG: 5,
};

const ALL_CATEGORIES = [
  "PEOPLE_SEARCH",
  "MARKETING_LIST_PROVIDER",
  "LEAD_GENERATION",
  "DATA_ENRICHMENT",
  "ADTECH_AUDIENCE_DATA",
  "RECRUITMENT_PROFILE_AGGREGATION",
  "PROPERTY_PUBLIC_RECORDS",
  "RISK_IDENTITY_FRAUD",
] as const;

const FICTIONAL_SUFFIX = /\.(example|invalid)$/;

function hostOf(url: string): string {
  return new URL(url).hostname;
}

function urlsOf(broker: BrokerSeed): string[] {
  const urls = [
    broker.websiteUrl,
    broker.privacyRequestUrl,
    broker.optOutUrl,
    broker.webFormUrl,
    broker.sourceUrl,
    ...broker.contactMethods
      .filter((method) => method.type !== "EMAIL" && method.type !== "POSTAL")
      .map((method) => method.value),
    ...broker.contactMethods.map((method) => method.sourceUrl),
    ...broker.seedSources.map((source) => source.sourceUrl),
  ];

  return urls.filter((url): url is string => typeof url === "string");
}

function emailsOf(broker: BrokerSeed): string[] {
  const emails = [
    broker.privacyEmail,
    ...broker.contactMethods
      .filter((method) => method.type === "EMAIL")
      .map((method) => method.value),
  ];

  return emails.filter((email): email is string => typeof email === "string");
}

function coverageCount(code: string): number {
  return DEMO_BROKERS.filter((broker) =>
    broker.coverage.some((entry) => entry.jurisdictionCode === code)
  ).length;
}

describe("demo broker seed data", () => {
  it("ships at least forty brokers with unique slugs", () => {
    expect(DEMO_BROKERS.length).toBeGreaterThanOrEqual(40);
    const slugs = DEMO_BROKERS.map((broker) => broker.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("marks every record as demo data with sending disabled", () => {
    for (const broker of DEMO_BROKERS) {
      expect(broker.isDemoData, `${broker.slug} is not demo data`).toBe(true);
      expect(broker.productionSendingEnabled, `${broker.slug} allows sending`).toBe(
        false
      );
      expect(broker.notes.length, `${broker.slug} has no note`).toBeGreaterThan(20);
    }
  });

  it("gives every broker at least one contact method and one seed source", () => {
    for (const broker of DEMO_BROKERS) {
      expect(
        broker.contactMethods.length,
        `${broker.slug} has no contact`
      ).toBeGreaterThan(0);
      expect(broker.seedSources.length, `${broker.slug} has no source`).toBeGreaterThan(
        0
      );

      const demoSources = broker.seedSources.filter(
        (source) => source.sourceType === "DEMO_FICTIONAL"
      );
      expect(
        demoSources.length,
        `${broker.slug} has no fictional source`
      ).toBeGreaterThan(0);

      for (const source of broker.seedSources) {
        expect(source.isDemo).toBe(true);
        expect(source.sourceTitle.length).toBeGreaterThan(5);
        expect(Number.isNaN(Date.parse(source.retrievedAt))).toBe(false);
        expect(source.notes, `${broker.slug} source note`).toMatch(
          /replace it with independently verified data|illustrative|invented/i
        );
      }
    }
  });

  it("only uses fictional .example or .invalid domains", () => {
    for (const broker of DEMO_BROKERS) {
      for (const url of urlsOf(broker)) {
        expect(url, `${broker.slug} URL ${url}`).toMatch(/^https:\/\//);
        expect(hostOf(url), `${broker.slug} URL ${url}`).toMatch(FICTIONAL_SUFFIX);
      }

      for (const email of emailsOf(broker)) {
        const domain = email.split("@")[1] ?? "";
        expect(domain, `${broker.slug} email ${email}`).toMatch(FICTIONAL_SUFFIX);
      }
    }
  });

  it("marks postal addresses as fictional", () => {
    const postal = DEMO_BROKERS.flatMap((broker) =>
      broker.contactMethods.filter((method) => method.type === "POSTAL")
    );

    expect(postal.length).toBeGreaterThan(0);
    for (const method of postal) {
      expect(method.value).toMatch(/fictional address/i);
    }
  });

  it("fills at least four brokers per category", () => {
    for (const category of ALL_CATEGORIES) {
      const count = DEMO_BROKERS.filter((broker) => broker.category === category).length;
      expect(count, `${category} has only ${count} brokers`).toBeGreaterThanOrEqual(
        CATEGORY_MINIMUM
      );
    }
  });

  it("meets the jurisdiction coverage minimums", () => {
    for (const [code, minimum] of Object.entries(JURISDICTION_MINIMUMS)) {
      const count = coverageCount(code);
      expect(count, `${code} is covered by only ${count} brokers`).toBeGreaterThanOrEqual(
        minimum
      );
    }
  });

  it("references only known jurisdictions once per broker", () => {
    const codes = new Set(JURISDICTIONS.map((jurisdiction) => jurisdiction.code));

    for (const broker of DEMO_BROKERS) {
      expect(broker.coverage.length, `${broker.slug} has no coverage`).toBeGreaterThan(0);
      const seen = new Set<string>();

      for (const entry of broker.coverage) {
        expect(codes.has(entry.jurisdictionCode), entry.jurisdictionCode).toBe(true);
        expect(
          seen.has(entry.jurisdictionCode),
          `${broker.slug} duplicate coverage`
        ).toBe(false);
        seen.add(entry.jurisdictionCode);
        expect(entry.notes.length).toBeGreaterThan(10);
      }
    }
  });

  it("spreads the verification status across the whole lifecycle", () => {
    const statuses = new Set(DEMO_BROKERS.map((broker) => broker.verificationStatus));

    for (const status of [
      "UNVERIFIED",
      "SOURCE_FOUND",
      "CONTACT_VERIFIED",
      "REQUEST_METHOD_VERIFIED",
      "RESPONSE_BEHAVIOR_VERIFIED",
      "DEPRECATED",
      "INACTIVE",
    ]) {
      expect([...statuses], `no broker with status ${status}`).toContain(status);
    }
  });

  it("keeps unverified records without a verification date", () => {
    for (const broker of DEMO_BROKERS) {
      if (broker.verificationStatus === "UNVERIFIED") {
        expect(
          broker.lastVerifiedAt,
          `${broker.slug} claims a verification date`
        ).toBeUndefined();
      }
      expect(broker.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(broker.confidenceScore).toBeLessThanOrEqual(100);
    }
  });

  it("requires manual review for restricted records and explains why", () => {
    const restricted = DEMO_BROKERS.filter((broker) => broker.riskTier === "RESTRICTED");
    expect(restricted.length).toBeGreaterThanOrEqual(3);

    for (const broker of restricted) {
      expect(broker.manualReviewRequired, `${broker.slug} skips manual review`).toBe(
        true
      );
      expect(broker.notes.length, `${broker.slug} note is too short`).toBeGreaterThan(
        120
      );
      expect(broker.notes).toMatch(/restricted because/i);
    }

    const categories = restricted.map((broker) => broker.category);
    expect(categories).toContain("RISK_IDENTITY_FRAUD");
    expect(categories).toContain("PROPERTY_PUBLIC_RECORDS");
  });

  it("keeps the deactivated records flagged as unsafe to send", () => {
    for (const broker of DEMO_BROKERS) {
      if (broker.verificationStatus === "DEPRECATED" || !broker.isActive) {
        expect(broker.productionUnsafeFlag, `${broker.slug} is not flagged`).toBe(true);
      }
    }
  });

  it("only claims a verified contact with a fictional verification note", () => {
    const verified = DEMO_BROKERS.flatMap((broker) =>
      broker.contactMethods.filter((method) => method.isVerified)
    );

    expect(verified.length).toBeGreaterThan(0);
    expect(verified.length).toBeLessThan(
      DEMO_BROKERS.reduce((total, broker) => total + broker.contactMethods.length, 0) / 2
    );

    for (const method of verified) {
      expect(method.verifiedBy).toBe("demo data");
      expect(method.verifiedAt).toBeDefined();
      expect(method.verificationNote).toMatch(/fictional/i);
    }
  });

  it("keeps contact methods unique per broker and offers the required channels", () => {
    const types = new Set<string>();

    for (const broker of DEMO_BROKERS) {
      const seen = new Set<string>();
      for (const method of broker.contactMethods) {
        const key = `${method.type}:${method.value}`;
        expect(seen.has(key), `${broker.slug} duplicate contact ${key}`).toBe(false);
        seen.add(key);
        types.add(method.type);
      }
    }

    for (const type of [
      "EMAIL",
      "WEB_FORM",
      "PRIVACY_PORTAL_URL",
      "POSTAL",
      "DROP_PLATFORM",
    ]) {
      expect([...types], `no contact method of type ${type}`).toContain(type);
    }
  });

  it("puts the deletion platform example on a California broker", () => {
    const withDrop = DEMO_BROKERS.filter((broker) =>
      broker.contactMethods.some((method) => method.type === "DROP_PLATFORM")
    );

    expect(withDrop.length).toBeGreaterThanOrEqual(1);
    for (const broker of withDrop) {
      expect(
        broker.coverage.some((entry) => entry.jurisdictionCode === "US-CA"),
        `${broker.slug} has no California coverage`
      ).toBe(true);
    }
  });

  it("keeps aliases unique and documents API support", () => {
    for (const broker of DEMO_BROKERS) {
      const aliases = broker.aliases.map((alias) => alias.alias);
      expect(new Set(aliases).size, `${broker.slug} duplicate alias`).toBe(
        aliases.length
      );

      if (broker.apiSupported) {
        expect(broker.apiNotes, `${broker.slug} has no API note`).toBeDefined();
      } else {
        expect(broker.apiNotes).toBeUndefined();
      }
    }

    const withApi = DEMO_BROKERS.filter((broker) => broker.apiSupported);
    expect(withApi.length).toBeGreaterThanOrEqual(2);
  });
});
