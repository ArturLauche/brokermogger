/** Seed updates append versions; published and operator-maintained history stays intact. */
import type { PrismaClient } from "@prisma/client";

import { LEGAL_RULES, RETIRED_DEFAULT_LEGAL_RULES } from "./data/legal-rules";
import { loadJurisdictionIds, requireJurisdictionId } from "./jurisdictions";
import { emptyResult, type SeedStepResult } from "./types";
import { hasSameSeedContent } from "./versioning";

export async function seedLegalRules(prisma: PrismaClient): Promise<SeedStepResult> {
  const result = emptyResult("Legal rules");
  const jurisdictionIds = await loadJurisdictionIds(prisma);
  let addedVersions = 0;
  let retiredVersions = 0;

  for (const retired of RETIRED_DEFAULT_LEGAL_RULES) {
    const jurisdictionId = requireJurisdictionId(
      jurisdictionIds,
      retired.jurisdictionCode
    );
    const resultForRule = await prisma.$transaction(async (tx) => {
      const lockKey = `catalogue:legal:${jurisdictionId}:${retired.key}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const reference = await tx.legalRule.findUnique({
        where: { jurisdictionId_key: { jurisdictionId, key: retired.key } },
        select: { id: true },
      });
      if (!reference) return { retired: 0, skipped: false };
      await tx.$executeRaw`SELECT 1 FROM "LegalRule" WHERE id = ${reference.id} FOR UPDATE`;
      const stored = await tx.legalRule.findUniqueOrThrow({
        where: { id: reference.id },
        include: { versions: { select: { createdById: true } } },
      });
      if (
        stored.createdById ||
        stored.updatedById ||
        stored.versions.some((version) => version.createdById)
      )
        return { retired: 0, skipped: true };
      await tx.legalRule.update({ where: { id: stored.id }, data: { isActive: false } });
      const archived = await tx.legalRuleVersion.updateMany({
        where: {
          legalRuleId: stored.id,
          createdById: null,
          status: { in: ["PUBLISHED", "SUPERSEDED"] },
        },
        data: { status: "ARCHIVED" },
      });
      return { retired: archived.count, skipped: false };
    });
    retiredVersions += resultForRule.retired;
    if (resultForRule.skipped) result.skipped += 1;
  }

  for (const rule of LEGAL_RULES) {
    const jurisdictionId = requireJurisdictionId(jurisdictionIds, rule.jurisdictionCode);

    const existed = await prisma.$transaction(async (tx) => {
      // Lock before the parent exists as well as during later version updates.
      const lockKey = `catalogue:legal:${jurisdictionId}:${rule.key}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
      const existingRule = await tx.legalRule.findUnique({
        where: { jurisdictionId_key: { jurisdictionId, key: rule.key } },
      });
      const ruleData = {
        lawName: rule.lawName,
        shortName: rule.shortName,
        description: rule.description,
      };
      const reference = await tx.legalRule.upsert({
        where: { jurisdictionId_key: { jurisdictionId, key: rule.key } },
        create: { jurisdictionId, key: rule.key, ...ruleData, isActive: rule.isActive },
        update: {},
      });
      await tx.$executeRaw`SELECT 1 FROM "LegalRule" WHERE id = ${reference.id} FOR UPDATE`;
      const stored = await tx.legalRule.findUniqueOrThrow({
        where: { id: reference.id },
      });
      if (!stored.createdById && !stored.updatedById)
        await tx.legalRule.update({ where: { id: stored.id }, data: ruleData });
      if (rule.retirePublishedBefore) {
        const operatorVersions = await tx.legalRuleVersion.count({
          where: { legalRuleId: stored.id, createdById: { not: null } },
        });
        if (!stored.createdById && !stored.updatedById && !operatorVersions) {
          const retired = await tx.legalRuleVersion.updateMany({
            where: {
              legalRuleId: stored.id,
              createdById: null,
              status: { in: ["PUBLISHED", "SUPERSEDED"] },
              effectiveFrom: { lt: new Date(rule.retirePublishedBefore) },
            },
            data: { status: "ARCHIVED" },
          });
          retiredVersions += retired.count;
        }
      }
      for (const version of rule.versions) {
        if (version.confidence === "LOW" && !version.requiresLegalReview) {
          throw new Error(
            `Legal rule ${rule.jurisdictionCode}/${rule.key} version ${version.version} has LOW confidence without requiresLegalReview.`
          );
        }

        const versionData = {
          status: version.status,
          supportedRequestTypes: version.supportedRequestTypes,
          legalBasisText: version.legalBasisText,
          deadlineDays: version.deadlineDays,
          deadlineRule: version.deadlineRule,
          verificationRequirements: version.verificationRequirements,
          escalationPath: version.escalationPath,
          escalationAuthority: version.escalationAuthority ?? null,
          escalationUrl: version.escalationUrl ?? null,
          templateClauses: version.templateClauses,
          riskNotes: version.riskNotes,
          requiresLegalReview: version.requiresLegalReview,
          confidence: version.confidence,
          sourceUrl: version.sourceUrl,
          sourceTitle: version.sourceTitle,
          additionalSources: version.additionalSources,
          lastReviewedAt: new Date(version.lastReviewedAt),
          reviewedBy: version.reviewedBy,
          effectiveFrom: new Date(version.effectiveFrom),
          effectiveUntil: version.effectiveUntil
            ? new Date(version.effectiveUntil)
            : null,
          changeNotes: version.changeNotes,
        };

        const versions = await tx.legalRuleVersion.findMany({
          where: { legalRuleId: stored.id },
          orderBy: { version: "desc" },
        });
        if (versions.some((previous) => hasSameSeedContent(previous, versionData)))
          continue;
        const operatorManaged =
          !!stored.createdById ||
          !!stored.updatedById ||
          versions.some((previous) => !!previous.createdById);
        const nextVersion = (versions[0]?.version ?? 0) + 1;
        const status = operatorManaged ? "DRAFT" : versionData.status;
        await tx.legalRuleVersion.create({
          data: { legalRuleId: stored.id, version: nextVersion, ...versionData, status },
        });
        if (status === "PUBLISHED" && versionData.effectiveFrom <= new Date())
          await tx.legalRuleVersion.updateMany({
            where: {
              legalRuleId: stored.id,
              status: "PUBLISHED",
              version: { lt: nextVersion },
              effectiveFrom: { lte: versionData.effectiveFrom },
            },
            data: { status: "SUPERSEDED" },
          });
        addedVersions += 1;
      }
      return !!existingRule;
    });
    if (existed) result.updated += 1;
    else result.created += 1;
  }

  result.notes.push(
    `${addedVersions} new versions; ${retiredVersions} obsolete default versions archived without changing content. Operator-maintained rules receive draft updates and retain their choices.`
  );

  return result;
}
