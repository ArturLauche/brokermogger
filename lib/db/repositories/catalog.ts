/**
 * Read-only catalogue: jurisdictions, published legal rules, templates, brokers.
 *
 * Catalogue rows are public instance configuration, not personal data. They are
 * cached in-process for a short TTL because almost every authenticated page
 * loads them. Writes from the admin console must call `invalidateCatalogCache`.
 * Directory searches are not cached: the key would be unbounded free text.
 */
import type { BrokerCategory, RequestType } from "@prisma/client";

import { createKeyedTtlCache, createTtlCache } from "@/lib/cache/ttl";
import { prisma } from "@/lib/db/client";
import type { JurisdictionRecord, LegalRuleSnapshot } from "@/lib/jurisdiction/types";
import { brokerCategorySchema } from "@/lib/validation/enums";

const CATALOG_TTL_MS = 60_000;
const jurisdictionsCache = createTtlCache<JurisdictionRecord[]>(CATALOG_TTL_MS);
const legalRulesCache = createTtlCache<LegalRuleSnapshot[]>(CATALOG_TTL_MS);
const brokerDirectoryCache = createKeyedTtlCache<
  Awaited<ReturnType<typeof loadBrokersForDirectory>>
>(CATALOG_TTL_MS, 32);

const DIRECTORY_TAKE = 500;

export function invalidateCatalogCache(): void {
  jurisdictionsCache.clear();
  legalRulesCache.clear();
  brokerDirectoryCache.clear();
}

/** Test helper. Never call this from application code. */
export function resetCatalogCacheForTests(): void {
  invalidateCatalogCache();
}

export async function listActiveJurisdictions(): Promise<JurisdictionRecord[]> {
  return jurisdictionsCache.getOrLoad(async () => {
    const rows = await prisma.jurisdiction.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      countryCode: row.countryCode,
      region: row.region,
      isActive: row.isActive,
    }));
  });
}

export async function listPublishedLegalRules(): Promise<LegalRuleSnapshot[]> {
  return legalRulesCache.getOrLoad(async () => {
    const now = new Date();
    const versions = await prisma.legalRuleVersion.findMany({
      where: {
        status: { in: ["PUBLISHED", "SUPERSEDED", "ARCHIVED"] },
        effectiveFrom: { lte: now },
        legalRule: { isActive: true, deletedAt: null, jurisdiction: { isActive: true } },
      },
      include: { legalRule: true },
      orderBy: [{ legalRuleId: "asc" }, { effectiveFrom: "desc" }, { version: "desc" }],
    });
    const seen = new Set<string>();
    const latest = versions.filter((version) => {
      if (seen.has(version.legalRuleId)) return false;
      seen.add(version.legalRuleId);
      // An expired/withdrawn replacement must not silently revive its predecessor.
      return (
        version.status === "PUBLISHED" &&
        (!version.effectiveUntil || version.effectiveUntil > now)
      );
    });

    return latest.map((version) => ({
      legalRuleId: version.legalRuleId,
      legalRuleVersionId: version.id,
      legalRuleKey: version.legalRule.key,
      jurisdictionId: version.legalRule.jurisdictionId,
      lawName: version.legalRule.lawName,
      version: version.version,
      supportedRequestTypes: version.supportedRequestTypes,
      legalBasisText: version.legalBasisText,
      deadlineDays: version.deadlineDays,
      deadlineRule: version.deadlineRule,
      verificationRequirements: version.verificationRequirements,
      escalationPath: version.escalationPath,
      escalationAuthority: version.escalationAuthority,
      escalationUrl: version.escalationUrl,
      templateClauses: version.templateClauses,
      riskNotes: version.riskNotes,
      requiresLegalReview: version.requiresLegalReview,
      confidence: version.confidence,
      sourceUrl: version.sourceUrl,
      sourceTitle: version.sourceTitle,
      lastReviewedAt: version.lastReviewedAt,
      reviewedBy: version.reviewedBy,
    }));
  });
}

export async function findPublishedTemplate(input: {
  requestType: RequestType;
  jurisdictionId: string | null;
}) {
  const specific = input.jurisdictionId
    ? await prisma.requestTemplate.findFirst({
        where: {
          requestType: input.requestType,
          jurisdictionId: input.jurisdictionId,
          isActive: true,
          deletedAt: null,
        },
        include: {
          versions: {
            where: { status: "PUBLISHED" },
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      })
    : null;

  const generic = await prisma.requestTemplate.findFirst({
    where: {
      requestType: input.requestType,
      jurisdictionId: null,
      isActive: true,
      deletedAt: null,
    },
    include: {
      versions: {
        where: { status: "PUBLISHED" },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  const template = specific?.versions[0] ? specific : generic;
  const version = template?.versions[0];
  if (!template || !version) return null;
  return { template, version };
}

/** A single narrow query for the new-request chooser, including generic templates. */
export async function listPublishedTemplateTypes(jurisdictionId: string) {
  const rows = await prisma.requestTemplate.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      OR: [{ jurisdictionId }, { jurisdictionId: null }],
      versions: { some: { status: "PUBLISHED" } },
    },
    select: { requestType: true },
    distinct: ["requestType"],
  });
  return rows.map((row) => row.requestType);
}

function parseBrokerCategory(value: string | undefined): BrokerCategory | undefined {
  if (!value) return undefined;
  const parsed = brokerCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

async function loadBrokersForDirectory(filters: {
  jurisdictionId?: string;
  category?: string;
  search?: string;
}) {
  const category = parseBrokerCategory(filters.category);
  const search = filters.search?.trim().slice(0, 80);

  return prisma.broker.findMany({
    where: {
      deletedAt: null,
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { legalName: { contains: search, mode: "insensitive" } },
              { slug: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(filters.jurisdictionId
        ? {
            jurisdictionCoverage: {
              some: { jurisdictionId: filters.jurisdictionId, isActive: true },
            },
          }
        : {}),
    },
    include: {
      contactMethods: { where: { deletedAt: null, isActive: true } },
      jurisdictionCoverage: { where: { isActive: true } },
    },
    orderBy: { legalName: "asc" },
    take: DIRECTORY_TAKE,
  });
}

export async function listBrokersForDirectory(filters: {
  jurisdictionId?: string;
  category?: string;
  search?: string;
}) {
  const search = filters.search?.trim().slice(0, 80);
  if (search) {
    return loadBrokersForDirectory(filters);
  }
  const cacheKey = JSON.stringify({
    jurisdictionId: filters.jurisdictionId ?? "",
    category: filters.category ?? "",
  });
  return brokerDirectoryCache.getOrLoad(cacheKey, () => loadBrokersForDirectory(filters));
}

export async function getBrokerWithContacts(brokerId: string) {
  return prisma.broker.findFirst({
    where: { id: brokerId, deletedAt: null },
    include: {
      contactMethods: { where: { deletedAt: null } },
      jurisdictionCoverage: true,
    },
  });
}

export async function getBrokersWithContacts(brokerIds: readonly string[]) {
  if (brokerIds.length === 0) return [];
  return prisma.broker.findMany({
    where: { id: { in: [...brokerIds] }, deletedAt: null },
    include: {
      contactMethods: { where: { deletedAt: null } },
      jurisdictionCoverage: true,
    },
  });
}
