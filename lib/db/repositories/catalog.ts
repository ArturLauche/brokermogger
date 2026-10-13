/**
 * Read-only catalogue: jurisdictions, published legal rules, templates, brokers.
 *
 * Catalogue rows are public instance configuration, not personal data. They are
 * cached in-process for a short TTL because almost every authenticated page
 * loads them. Writes from the admin console must call `invalidateCatalogCache`.
 * Directory searches are not cached: the key would be unbounded free text.
 */
import type { RequestChannel, RequestType, Prisma } from "@prisma/client";
import { MAX_BROKERS_PER_WORKFLOW } from "@/lib/requests/fairUse";

import { createTtlCache } from "@/lib/cache/ttl";
import { prisma } from "@/lib/db/client";
import type { JurisdictionRecord, LegalRuleSnapshot } from "@/lib/jurisdiction/types";
import { brokerCategorySchema } from "@/lib/validation/enums";
import { z } from "zod";
import { pageInputSchema, createdBeforeCursor, cursorPage } from "@/lib/pagination";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";

import { brokerReadiness } from "@/lib/brokers/readiness";
import { BROKER_READINESS_SELECT, withBrokerReadiness } from "./brokerReadiness";

const CATALOG_TTL_MS = 60_000;
const jurisdictionsCache = createTtlCache<JurisdictionRecord[]>(CATALOG_TTL_MS);
type CatalogueLegalVersion = Prisma.LegalRuleVersionGetPayload<{
  include: { legalRule: true };
}>;
const legalRulesCache = createTtlCache<CatalogueLegalVersion[]>(CATALOG_TTL_MS);

export function invalidateCatalogCache(): void {
  jurisdictionsCache.clear();
  legalRulesCache.clear();
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
  // Cache immutable public versions, not a time-dependent eligibility decision.
  // Scheduled changes and expiry apply on this very read, even inside the TTL.
  const versions = await legalRulesCache.getOrLoad(() =>
    prisma.legalRuleVersion.findMany({
      where: {
        status: { in: ["PUBLISHED", "SUPERSEDED", "ARCHIVED"] },
        legalRule: { isActive: true, deletedAt: null, jurisdiction: { isActive: true } },
      },
      include: { legalRule: true },
      orderBy: [{ legalRuleId: "asc" }, { effectiveFrom: "desc" }, { version: "desc" }],
    })
  );
  const now = new Date();
  const seen = new Set<string>();
  const latest = versions.filter((version) => {
    if (version.effectiveFrom > now) return false;
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
}

export async function findPublishedTemplate(input: {
  requestType: RequestType;
  jurisdictionId: string | null;
  channel?: RequestChannel;
}) {
  const channel = input.channel ?? "EMAIL";
  const jurisdictions = input.jurisdictionId ? [input.jurisdictionId, null] : [null];
  // Jurisdiction language takes precedence. EMAIL is the shared plain-letter
  // fallback for manual channels; a portal template never serves an email.
  const channels: RequestChannel[] = channel === "EMAIL" ? [channel] : [channel, "EMAIL"];
  for (const jurisdictionId of jurisdictions) {
    for (const deliveryChannel of channels) {
      const template = await prisma.requestTemplate.findFirst({
        where: {
          requestType: input.requestType,
          jurisdictionId,
          channel: deliveryChannel,
          isActive: true,
          deletedAt: null,
          versions: { some: { status: "PUBLISHED" } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        include: {
          versions: {
            where: { status: "PUBLISHED" },
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      });
      if (template?.versions[0]) return { template, version: template.versions[0] };
    }
  }
  return null;
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

const directoryListSchema = pageInputSchema.extend({
  jurisdictionId: entityIdSchema.optional(),
  category: z.union([z.literal("all"), brokerCategorySchema]).default("all"),
  search: z.string().trim().max(100).default(""),
});
const DIRECTORY_SELECT = {
  ...BROKER_READINESS_SELECT,
  id: true,
  createdAt: true,
  legalName: true,
  category: true,
  isActive: true,
  isDemoData: true,
  productionSendingEnabled: true,
  verificationStatus: true,
} satisfies Prisma.BrokerSelect;

/** Public configuration only. Search and pages are bounded, without private fields. */
export async function listBrokersForDirectory(raw: unknown = {}) {
  const input = parseWithSchema(directoryListSchema, raw);
  const where: Prisma.BrokerWhereInput = {
    deletedAt: null,
    ...(input.category !== "all" ? { category: input.category } : {}),
    ...(input.search
      ? {
          OR: [
            { legalName: { contains: input.search, mode: "insensitive" } },
            { slug: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(input.jurisdictionId
      ? {
          jurisdictionCoverage: {
            some: { jurisdictionId: input.jurisdictionId, isActive: true },
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.broker.findMany({
      where: { AND: [where, createdBeforeCursor(input.cursor)] },
      select: DIRECTORY_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    }),
    prisma.broker.count({ where }),
  ]);
  const page = cursorPage(rows, input.limit);
  return { ...page, items: page.items.map((row) => withBrokerReadiness(row)), total };
}

/** Selected choices stay visible across search/page changes; input is bounded independently. */
export async function getSelectedBrokersForChoice(raw: unknown) {
  const ids = parseWithSchema(z.array(entityIdSchema).max(MAX_BROKERS_PER_WORKFLOW), raw);
  if (!ids.length) return [];
  const rows = await prisma.broker.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: DIRECTORY_SELECT,
  });
  return rows.map((row) => withBrokerReadiness(row));
}

export async function getBrokerWithContacts(brokerId: string) {
  const broker = await prisma.broker.findFirst({
    where: { id: brokerId, deletedAt: null },
    select: {
      ...BROKER_READINESS_SELECT,
      legalName: true,
      tradingNames: true,
      category: true,
      websiteUrl: true,
      isActive: true,
      isDemoData: true,
      productionSendingEnabled: true,
      verificationStatus: true,
      lastVerifiedAt: true,
      sourceUrl: true,
      notes: true,
      verificationRequirements: true,
      contactMethods: {
        where: { deletedAt: null, isActive: true },
        orderBy: [{ priority: "asc" }, { id: "asc" }],
        select: {
          id: true,
          type: true,
          value: true,
          isActive: true,
          label: true,
          isVerified: true,
          verifiedAt: true,
          sourceUrl: true,
          verificationNote: true,
        },
      },
      jurisdictionCoverage: {
        where: { isActive: true },
        select: {
          id: true,
          supportedRequestTypes: true,
          isActive: true,
          coverageType: true,
          confidence: true,
          notes: true,
          jurisdiction: { select: { name: true, isActive: true } },
        },
      },
    },
  });
  if (!broker) return null;
  return {
    ...broker,
    readiness: brokerReadiness(broker),
    contactMethods: broker.contactMethods.map(
      ({ verificationNote: _evidence, ...method }) => method
    ),
  };
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
