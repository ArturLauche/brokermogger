/**
 * Runs the seed writers against the test database.
 *
 * Two things matter here: the writers produce exactly the shipped data set,
 * and running them a second time changes nothing. The unit tests already cover
 * the content of the data modules, so this file only checks the writing side.
 */
import { describe, expect, it } from "vitest";

import { ALL_SETTINGS } from "@/lib/config/systemSettings";
import { templateChecksum } from "@/prisma/seeds/checksum";
import { seedBrokers } from "@/prisma/seeds/brokers";
import { DEMO_BROKERS } from "@/prisma/seeds/data/brokers";
import { JURISDICTIONS } from "@/prisma/seeds/data/jurisdictions";
import { LEGAL_RULES } from "@/prisma/seeds/data/legal-rules";
import { REQUEST_TEMPLATES } from "@/prisma/seeds/data/templates";
import { seedDemoUsers } from "@/prisma/seeds/demoUsers";
import { seedJurisdictions } from "@/prisma/seeds/jurisdictions";
import { seedLegalRules } from "@/prisma/seeds/legalRules";
import { seedSystemSettings } from "@/prisma/seeds/settings";
import { seedRequestTemplates } from "@/prisma/seeds/templates";
import { testPrisma } from "../../helpers/db";

const EXPECTED = {
  jurisdictions: JURISDICTIONS.length,
  legalRules: LEGAL_RULES.length,
  legalRuleVersions: LEGAL_RULES.reduce((total, rule) => total + rule.versions.length, 0),
  templates: REQUEST_TEMPLATES.length,
  templateVersions: REQUEST_TEMPLATES.length,
  brokers: DEMO_BROKERS.length,
  brokerAliases: DEMO_BROKERS.reduce((total, broker) => total + broker.aliases.length, 0),
  contactMethods: DEMO_BROKERS.reduce(
    (total, broker) => total + broker.contactMethods.length,
    0
  ),
  coverage: DEMO_BROKERS.reduce((total, broker) => total + broker.coverage.length, 0),
  seedSources: DEMO_BROKERS.reduce(
    (total, broker) => total + broker.seedSources.length,
    0
  ),
  settings: ALL_SETTINGS.length,
};

async function runSeed() {
  return {
    jurisdictions: await seedJurisdictions(testPrisma),
    legalRules: await seedLegalRules(testPrisma),
    templates: await seedRequestTemplates(testPrisma),
    brokers: await seedBrokers(testPrisma),
    settings: await seedSystemSettings(testPrisma),
  };
}

async function countRows() {
  const [
    jurisdictions,
    legalRules,
    legalRuleVersions,
    templates,
    templateVersions,
    brokers,
    brokerAliases,
    contactMethods,
    coverage,
    seedSources,
    settings,
  ] = await Promise.all([
    testPrisma.jurisdiction.count(),
    testPrisma.legalRule.count(),
    testPrisma.legalRuleVersion.count(),
    testPrisma.requestTemplate.count(),
    testPrisma.requestTemplateVersion.count(),
    testPrisma.broker.count(),
    testPrisma.brokerAlias.count(),
    testPrisma.brokerContactMethod.count(),
    testPrisma.brokerJurisdictionCoverage.count(),
    testPrisma.brokerSeedSource.count(),
    testPrisma.systemSetting.count(),
  ]);

  return {
    jurisdictions,
    legalRules,
    legalRuleVersions,
    templates,
    templateVersions,
    brokers,
    brokerAliases,
    contactMethods,
    coverage,
    seedSources,
    settings,
  };
}

describe("seed writers", () => {
  it("writes the whole demo data set and stays stable when run again", async () => {
    const first = await runSeed();

    expect(first.jurisdictions.created).toBe(EXPECTED.jurisdictions);
    expect(first.brokers.created).toBe(EXPECTED.brokers);
    expect(first.brokers.skipped).toBe(0);
    expect(first.settings.created).toBe(EXPECTED.settings);

    const afterFirst = await countRows();
    expect(afterFirst).toEqual(EXPECTED);

    const second = await runSeed();

    expect(second.jurisdictions.created).toBe(0);
    expect(second.jurisdictions.updated).toBe(EXPECTED.jurisdictions);
    expect(second.brokers.created).toBe(0);
    expect(second.brokers.updated).toBe(EXPECTED.brokers);
    expect(second.brokers.removed).toBe(0);
    expect(second.settings.created).toBe(0);
    expect(second.settings.skipped).toBe(EXPECTED.settings);

    const afterSecond = await countRows();
    expect(afterSecond).toEqual(afterFirst);
  });

  it("stores brokers as demo data that cannot be used for production sending", async () => {
    await seedJurisdictions(testPrisma);
    await seedBrokers(testPrisma);

    const sendable = await testPrisma.broker.count({
      where: { productionSendingEnabled: true },
    });
    const nonDemo = await testPrisma.broker.count({ where: { isDemoData: false } });

    expect(sendable).toBe(0);
    expect(nonDemo).toBe(0);

    const withoutContact = await testPrisma.broker.count({
      where: { contactMethods: { none: {} } },
    });
    const withoutSource = await testPrisma.broker.count({
      where: { seedSources: { none: {} } },
    });

    expect(withoutContact).toBe(0);
    expect(withoutSource).toBe(0);

    const california = await testPrisma.broker.findUnique({
      where: { slug: "northwind-people-finder" },
      include: { contactMethods: true, jurisdictionCoverage: true },
    });

    expect(california?.contactMethods.map((method) => method.type)).toContain(
      "DROP_PLATFORM"
    );
    expect(california?.jurisdictionCoverage.length).toBeGreaterThan(0);
  });

  it("removes child rows that are no longer part of the demo data", async () => {
    await seedJurisdictions(testPrisma);
    await seedBrokers(testPrisma);

    const broker = await testPrisma.broker.findUniqueOrThrow({
      where: { slug: "northwind-people-finder" },
      select: { id: true },
    });

    await testPrisma.brokerAlias.create({
      data: { brokerId: broker.id, alias: "stale-alias.example", kind: "DOMAIN" },
    });

    const result = await seedBrokers(testPrisma);

    expect(result.removed).toBeGreaterThanOrEqual(1);
    const stale = await testPrisma.brokerAlias.count({
      where: { alias: "stale-alias.example" },
    });
    expect(stale).toBe(0);
  });

  it("does not overwrite a broker that a maintainer promoted to real data", async () => {
    await seedJurisdictions(testPrisma);
    await seedBrokers(testPrisma);

    await testPrisma.broker.update({
      where: { slug: "kestrel-person-lookup" },
      data: { isDemoData: false, notes: "Maintained by hand." },
    });

    const result = await seedBrokers(testPrisma);
    const broker = await testPrisma.broker.findUniqueOrThrow({
      where: { slug: "kestrel-person-lookup" },
    });

    expect(result.skipped).toBe(1);
    expect(broker.notes).toBe("Maintained by hand.");
    expect(broker.isDemoData).toBe(false);
  });

  it("keeps a setting value that an admin changed", async () => {
    await seedSystemSettings(testPrisma);

    await testPrisma.systemSetting.update({
      where: { key: "fair_use.requests_per_day" },
      data: { valueJson: 5 },
    });

    const result = await seedSystemSettings(testPrisma);
    const setting = await testPrisma.systemSetting.findUniqueOrThrow({
      where: { key: "fair_use.requests_per_day" },
    });

    expect(result.created).toBe(0);
    expect(setting.valueJson).toBe(5);
  });

  it("publishes template versions with a checksum over subject and body", async () => {
    await seedJurisdictions(testPrisma);
    await seedRequestTemplates(testPrisma);

    const stored = await testPrisma.requestTemplate.findUniqueOrThrow({
      where: { key: "generic.deletion" },
      include: { versions: true },
    });

    const version = stored.versions[0];
    expect(version?.status).toBe("PUBLISHED");
    expect(version?.checksum).toBe(
      templateChecksum(version?.subjectTemplate ?? "", version?.bodyTemplate ?? "")
    );
    expect(version?.requiredVariables).toContain("request.legalBasis");
    expect(version?.optionalVariables).toContain("consent.statement");
  });

  it("stores legal rule versions with review flags and sources", async () => {
    await seedJurisdictions(testPrisma);
    await seedLegalRules(testPrisma);

    const lowWithoutReview = await testPrisma.legalRuleVersion.count({
      where: { confidence: "LOW", requiresLegalReview: false },
    });
    const highConfidence = await testPrisma.legalRuleVersion.count({
      where: { confidence: "HIGH" },
    });

    expect(lowWithoutReview).toBe(0);
    expect(highConfidence).toBe(0);

    const published = await testPrisma.legalRuleVersion.count({
      where: { status: "PUBLISHED" },
    });
    expect(published).toBe(EXPECTED.legalRuleVersions);
  });

  it("creates demo users only when SEED_DEMO_USERS is true", async () => {
    const previous = process.env.SEED_DEMO_USERS;

    try {
      delete process.env.SEED_DEMO_USERS;
      const skipped = await seedDemoUsers(testPrisma);
      expect(skipped.created).toBe(0);
      expect(await testPrisma.user.count()).toBe(0);

      process.env.SEED_DEMO_USERS = "true";
      const created = await seedDemoUsers(testPrisma);
      expect(created.created).toBe(3);

      const users = await testPrisma.user.findMany({
        orderBy: { email: "asc" },
        include: { quota: true },
      });

      expect(users.map((user) => user.email)).toEqual([
        "admin@example.invalid",
        "maintainer@example.invalid",
        "user@example.invalid",
      ]);
      for (const user of users) {
        expect(user.emailVerified).not.toBeNull();
        expect(user.quota).not.toBeNull();
      }

      const again = await seedDemoUsers(testPrisma);
      expect(again.created).toBe(0);
      expect(again.updated).toBe(3);
      expect(await testPrisma.user.count()).toBe(3);
    } finally {
      if (previous === undefined) {
        delete process.env.SEED_DEMO_USERS;
      } else {
        process.env.SEED_DEMO_USERS = previous;
      }
    }
  });
});
