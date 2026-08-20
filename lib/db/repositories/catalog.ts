/**
 * Read-only catalogue: jurisdictions, published legal rules, templates, brokers.
 */
import type { RequestType } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import type { JurisdictionRecord, LegalRuleSnapshot } from "@/lib/jurisdiction/types";

export async function listActiveJurisdictions(): Promise<JurisdictionRecord[]> {
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
}

export async function listPublishedLegalRules(): Promise<LegalRuleSnapshot[]> {
  const versions = await prisma.legalRuleVersion.findMany({
    where: { status: "PUBLISHED" },
    include: { legalRule: true },
    orderBy: [{ legalRuleId: "asc" }, { version: "desc" }],
  });

  return versions.map((version) => ({
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

export async function listBrokersForDirectory(filters: {
  jurisdictionId?: string;
  category?: string;
  search?: string;
}) {
  return prisma.broker.findMany({
    where: {
      deletedAt: null,
      ...(filters.category ? { category: filters.category as never } : {}),
      ...(filters.search
        ? {
            OR: [
              { legalName: { contains: filters.search, mode: "insensitive" } },
              { slug: { contains: filters.search, mode: "insensitive" } },
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
  });
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
