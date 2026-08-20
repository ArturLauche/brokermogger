/**
 * Idempotent writer for the fictional demo brokers and their child rows.
 *
 * Rules this writer follows:
 *  * Brokers are keyed by `slug`. Re-running refreshes the record instead of
 *    creating a second one.
 *  * A record that a maintainer has promoted to real data (`isDemoData` set to
 *    false) is never touched again. The seed only owns demo rows.
 *  * Child rows that are no longer part of the demo data are removed so that a
 *    repeated run converges on exactly the shipped data set.
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

type ExistingBroker = Prisma.BrokerGetPayload<{
  include: {
    aliases: true;
    contactMethods: true;
    jurisdictionCoverage: true;
    seedSources: true;
  };
}>;

export async function seedBrokers(prisma: PrismaClient): Promise<SeedStepResult> {
  const result = emptyResult("Brokers");
  const jurisdictionIds = await loadJurisdictionIds(prisma);

  const existingRows = await prisma.broker.findMany({
    where: { slug: { in: DEMO_BROKERS.map((broker) => broker.slug) } },
    include: {
      aliases: true,
      contactMethods: true,
      jurisdictionCoverage: true,
      seedSources: true,
    },
  });
  const existingBySlug = new Map<string, ExistingBroker>(
    existingRows.map((row) => [row.slug, row])
  );

  for (const broker of DEMO_BROKERS) {
    const existing = existingBySlug.get(broker.slug);

    if (existing && !existing.isDemoData) {
      result.skipped += 1;
      result.notes.push(
        `${broker.slug}: left untouched because it is no longer marked as demo data`
      );
      continue;
    }

    const brokerId = await upsertBroker(prisma, broker);

    if (existing) {
      result.updated += 1;
    } else {
      result.created += 1;
    }

    result.removed += await syncAliases(prisma, brokerId, broker.aliases);
    result.removed += await syncContactMethods(prisma, brokerId, broker.contactMethods);
    result.removed += await syncCoverage(
      prisma,
      brokerId,
      broker.coverage,
      jurisdictionIds
    );
    result.removed += await syncSeedSources(prisma, brokerId, broker.seedSources);
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

async function upsertBroker(prisma: PrismaClient, broker: BrokerSeed): Promise<string> {
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
  prisma: PrismaClient,
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
  prisma: PrismaClient,
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

  const removed = await prisma.brokerContactMethod.deleteMany({
    where: { brokerId, id: { notIn: [...keep] } },
  });
  return removed.count;
}

async function syncCoverage(
  prisma: PrismaClient,
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
  prisma: PrismaClient,
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
