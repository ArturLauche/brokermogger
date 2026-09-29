/**
 * Idempotent writer for the fictional demo brokers and their child rows.
 *
 * Rules this writer follows:
 *  * Brokers are keyed by `slug`. Re-running refreshes the record instead of
 *    creating a second one.
 *  * Operator-managed, real and archived records are never overwritten.
 *    Parent locks serialize seeding with edits; each broker and its children commit together.
 *  * Child rows that are no longer part of the demo data are removed so that a
 *    repeated run converges on the shipped data set. Retired contacts are archived.
 *  * `productionSendingEnabled` stays false. The data module makes it
 *    impossible to set, and the database rejects it without full verification.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import {
  DEMO_BROKERS,
  type BrokerAliasSeed,
  type BrokerContactMethodSeed,
  type BrokerCoverageSeed,
  type BrokerSeed,
  type BrokerSeedSourceSeed,
} from "./data/brokers";
import { loadJurisdictionIds, requireJurisdictionId } from "./jurisdictions";
import { emptyResult, type SeedStepResult } from "./types";

export async function seedBrokers(prisma: PrismaClient): Promise<SeedStepResult> {
  const result = emptyResult("Brokers");
  const jurisdictionIds = await loadJurisdictionIds(prisma);

  for (const broker of DEMO_BROKERS) {
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`broker-seed:${broker.slug}`}, 0))`;
      await tx.$executeRaw`SELECT 1 FROM "Broker" WHERE slug = ${broker.slug} FOR UPDATE`;
      const existing = await tx.broker.findUnique({ where: { slug: broker.slug } });
      if (
        existing &&
        (!existing.isDemoData ||
          existing.createdById ||
          existing.updatedById ||
          existing.deletedAt)
      )
        return { kind: "skipped" as const, removed: 0 };
      const brokerId = await upsertBroker(tx, broker);
      let removed = await syncAliases(tx, brokerId, broker.aliases);
      removed += await syncContactMethods(tx, brokerId, broker.contactMethods);
      removed += await syncCoverage(tx, brokerId, broker.coverage, jurisdictionIds);
      removed += await syncSeedSources(tx, brokerId, broker.seedSources);
      return { kind: existing ? ("updated" as const) : ("created" as const), removed };
    });
    result[outcome.kind] += 1;
    result.removed += outcome.removed;
    if (outcome.kind === "skipped")
      result.notes.push(`${broker.slug}: preserved operator-managed or archived entry`);
  }

  const contactMethods = DEMO_BROKERS.reduce(
    (total, broker) => total + broker.contactMethods.length,
    0
  );
  const coverage = DEMO_BROKERS.reduce(
    (total, broker) => total + broker.coverage.length,
    0
  );
  result.notes.push(
    `${contactMethods} contact methods, ${coverage} jurisdiction coverage rows, all records are demo data with sending disabled`
  );

  return result;
}

async function upsertBroker(
  prisma: Prisma.TransactionClient,
  broker: BrokerSeed
): Promise<string> {
  const data = {
    legalName: broker.legalName,
    tradingNames: broker.tradingNames,
    websiteUrl: broker.websiteUrl,
    category: broker.category,
    subcategories: broker.subcategories,
    countriesServed: broker.countriesServed,
    regionsServed: broker.regionsServed,
    dataCategories: broker.dataCategories,
    privacyEmail: broker.privacyEmail ?? null,
    privacyRequestUrl: broker.privacyRequestUrl ?? null,
    optOutUrl: broker.optOutUrl ?? null,
    webFormUrl: broker.webFormUrl ?? null,
    postalAddress: broker.postalAddress ?? null,
    apiSupported: broker.apiSupported,
    apiNotes: broker.apiNotes ?? null,
    verificationRequirements: broker.verificationRequirements,
    knownResponseBehavior: broker.knownResponseBehavior,
    confidenceScore: broker.confidenceScore,
    sourceUrl: broker.sourceUrl,
    lastVerifiedAt: broker.lastVerifiedAt ? new Date(broker.lastVerifiedAt) : null,
    manualReviewRequired: broker.manualReviewRequired,
    isActive: broker.isActive,
    verificationStatus: broker.verificationStatus,
    productionSendingEnabled: false,
    productionUnsafeFlag: broker.productionUnsafeFlag,
    isDemoData: true,
    riskTier: broker.riskTier,
    notes: broker.notes,
    deletedAt: null,
  };

  const stored = await prisma.broker.upsert({
    where: { slug: broker.slug },
    create: { slug: broker.slug, ...data },
    update: data,
    select: { id: true },
  });

  return stored.id;
}

async function syncAliases(
  prisma: Prisma.TransactionClient,
  brokerId: string,
  aliases: BrokerAliasSeed[]
): Promise<number> {
  for (const alias of aliases) {
    await prisma.brokerAlias.upsert({
      where: { brokerId_alias: { brokerId, alias: alias.alias } },
      create: { brokerId, alias: alias.alias, kind: alias.kind },
      update: { kind: alias.kind },
    });
  }

  const removed = await prisma.brokerAlias.deleteMany({
    where: { brokerId, alias: { notIn: aliases.map((alias) => alias.alias) } },
  });
  return removed.count;
}

async function syncContactMethods(
  prisma: Prisma.TransactionClient,
  brokerId: string,
  methods: BrokerContactMethodSeed[]
): Promise<number> {
  const keep = new Set<string>();

  for (const method of methods) {
    const data = {
      label: method.label,
      isPreferred: method.isPreferred,
      isVerified: method.isVerified,
      verifiedAt: method.verifiedAt ? new Date(method.verifiedAt) : null,
      verifiedBy: method.verifiedBy ?? null,
      verificationNote: method.verificationNote ?? null,
      sourceUrl: method.sourceUrl ?? null,
      priority: method.priority,
      isActive: method.isActive,
      deletedAt: null,
    };

    const stored = await prisma.brokerContactMethod.upsert({
      where: {
        brokerId_type_value: { brokerId, type: method.type, value: method.value },
      },
      create: { brokerId, type: method.type, value: method.value, ...data },
      update: data,
      select: { id: true },
    });
    keep.add(stored.id);
  }

  const removed = await prisma.brokerContactMethod.updateMany({
    where: { brokerId, id: { notIn: [...keep] }, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false, isVerified: false },
  });
  return removed.count;
}

async function syncCoverage(
  prisma: Prisma.TransactionClient,
  brokerId: string,
  coverage: BrokerCoverageSeed[],
  jurisdictionIds: Map<string, string>
): Promise<number> {
  const keep: string[] = [];

  for (const entry of coverage) {
    const jurisdictionId = requireJurisdictionId(jurisdictionIds, entry.jurisdictionCode);
    keep.push(jurisdictionId);

    const data = {
      coverageType: entry.coverageType,
      supportedRequestTypes: entry.supportedRequestTypes,
      notes: entry.notes,
      confidence: entry.confidence,
      isActive: entry.isActive,
    };

    await prisma.brokerJurisdictionCoverage.upsert({
      where: { brokerId_jurisdictionId: { brokerId, jurisdictionId } },
      create: { brokerId, jurisdictionId, ...data },
      update: data,
    });
  }

  const removed = await prisma.brokerJurisdictionCoverage.deleteMany({
    where: { brokerId, jurisdictionId: { notIn: keep } },
  });
  return removed.count;
}

/**
 * `BrokerSeedSource` has no natural unique key in the schema, so the title is
 * used as the identity within one broker.
 */
async function syncSeedSources(
  prisma: Prisma.TransactionClient,
  brokerId: string,
  sources: BrokerSeedSourceSeed[]
): Promise<number> {
  const existing = await prisma.brokerSeedSource.findMany({
    where: { brokerId },
    select: { id: true, sourceTitle: true },
  });
  const existingByTitle = new Map(existing.map((row) => [row.sourceTitle, row.id]));

  for (const source of sources) {
    const data = {
      sourceUrl: source.sourceUrl ?? null,
      sourceType: source.sourceType,
      retrievedAt: new Date(source.retrievedAt),
      isDemo: source.isDemo,
      notes: source.notes,
    };

    const existingId = existingByTitle.get(source.sourceTitle);
    if (existingId) {
      await prisma.brokerSeedSource.update({ where: { id: existingId }, data });
    } else {
      await prisma.brokerSeedSource.create({
        data: { brokerId, sourceTitle: source.sourceTitle, ...data },
      });
    }
  }

  const titles = new Set(sources.map((source) => source.sourceTitle));
  const stale = existing
    .filter((row) => !titles.has(row.sourceTitle))
    .map((row) => row.id);
  if (stale.length === 0) {
    return 0;
  }

  const removed = await prisma.brokerSeedSource.deleteMany({
    where: { id: { in: stale } },
  });
  return removed.count;
}
