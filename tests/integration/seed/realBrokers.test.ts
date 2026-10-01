import { describe, expect, it } from "vitest";
import { seedJurisdictions } from "@/prisma/seeds/jurisdictions";
import { seedRealBrokerDrafts } from "@/prisma/seeds/realBrokers";
import { testPrisma } from "../../helpers/db";

describe("disabled sourced broker drafts", () => {
  it("creates three sourced manual drafts with no sending or verified coverage, and leaves subsequent decisions intact", async () => {
    await seedJurisdictions(testPrisma);
    expect((await seedRealBrokerDrafts(testPrisma)).created).toBe(3);
    const rows = await testPrisma.broker.findMany({
      include: { contactMethods: true, jurisdictionCoverage: true, seedSources: true },
    });
    expect(
      rows.every(
        (row) =>
          !row.isActive &&
          !row.isDemoData &&
          !row.productionSendingEnabled &&
          row.lastVerifiedAt === null &&
          row.verificationStatus === "SOURCE_FOUND"
      )
    ).toBe(true);
    expect(
      rows.every((row) =>
        row.contactMethods.every(
          (method) => !method.isVerified && method.type === "PRIVACY_PORTAL_URL"
        )
      )
    ).toBe(true);
    expect(
      rows.every((row) =>
        row.jurisdictionCoverage.every(
          (coverage) =>
            coverage.coverageType === "UNKNOWN" && coverage.confidence === "LOW"
        )
      )
    ).toBe(true);
    expect(
      rows.every(
        (row) =>
          row.seedSources.length > 0 &&
          row.seedSources.every(
            (source) => !source.isDemo && source.sourceType === "OFFICIAL_PRIVACY_PAGE"
          )
      )
    ).toBe(true);
    const people = rows.find((row) => row.slug === "peopleconnect")!;
    expect(people.notes).toMatch(/deleting it can also delete.*suppressions/i);
    expect(
      people.jurisdictionCoverage.every(
        (coverage) => coverage.supportedRequestTypes.join(",") === "SUPPRESSION"
      )
    ).toBe(true);
    await testPrisma.broker.update({
      where: { id: people.id },
      data: { notes: "Operator correction after review", isActive: true },
    });
    await testPrisma.brokerContactMethod.update({
      where: { id: people.contactMethods[0]!.id },
      data: { isActive: false },
    });
    const before = await testPrisma.broker.findUniqueOrThrow({
      where: { id: people.id },
      include: { contactMethods: true, jurisdictionCoverage: true, seedSources: true },
    });
    const second = await seedRealBrokerDrafts(testPrisma);
    expect(second).toMatchObject({ created: 0, skipped: 3, updated: 0 });
    expect(await testPrisma.broker.count()).toBe(3);
    expect(
      await testPrisma.broker.findUniqueOrThrow({
        where: { id: people.id },
        include: { contactMethods: true, jurisdictionCoverage: true, seedSources: true },
      })
    ).toEqual(before);
  });

  it("serializes competing first installs without duplicate broker children", async () => {
    await seedJurisdictions(testPrisma);
    const results = await Promise.all([
      seedRealBrokerDrafts(testPrisma),
      seedRealBrokerDrafts(testPrisma),
    ]);
    expect(results.reduce((sum, result) => sum + result.created, 0)).toBe(3);
    expect(await testPrisma.broker.count()).toBe(3);
    expect(await testPrisma.brokerContactMethod.count()).toBe(3);
  });
});
