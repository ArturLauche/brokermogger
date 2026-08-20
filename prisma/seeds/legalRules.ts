/**
 * Idempotent writer for legal rules and their versions.
 *
 * A rule is identified by (jurisdiction, key) and a version by (rule, version
 * number), so re-running the seed refreshes the shipped version 1 instead of
 * publishing a second one. A maintainer who changes legal content in a running
 * instance should publish a new version through the admin area; the seed only
 * owns the version numbers it ships.
 */
import type { PrismaClient } from "@prisma/client";

import { LEGAL_RULES } from "./data/legal-rules";
import { loadJurisdictionIds, requireJurisdictionId } from "./jurisdictions";
import { emptyResult, type SeedStepResult } from "./types";

export async function seedLegalRules(prisma: PrismaClient): Promise<SeedStepResult> {
  const result = emptyResult("Legal rules");
  const jurisdictionIds = await loadJurisdictionIds(prisma);

  for (const rule of LEGAL_RULES) {
    const jurisdictionId = requireJurisdictionId(jurisdictionIds, rule.jurisdictionCode);

    const existingRule = await prisma.legalRule.findUnique({
      where: { jurisdictionId_key: { jurisdictionId, key: rule.key } },
      select: { id: true },
    });

    const ruleData = {
      lawName: rule.lawName,
      shortName: rule.shortName,
      description: rule.description,
      isActive: rule.isActive,
    };

    const stored = await prisma.legalRule.upsert({
      where: { jurisdictionId_key: { jurisdictionId, key: rule.key } },
      create: { jurisdictionId, key: rule.key, ...ruleData },
      update: ruleData,
      select: { id: true },
    });

    if (existingRule) {
      result.updated += 1;
    } else {
      result.created += 1;
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
        changeNotes: version.changeNotes,
      };

      await prisma.legalRuleVersion.upsert({
        where: {
          legalRuleId_version: { legalRuleId: stored.id, version: version.version },
        },
        create: { legalRuleId: stored.id, version: version.version, ...versionData },
        update: versionData,
      });
    }
  }

  const versionCount = LEGAL_RULES.reduce(
    (total, rule) => total + rule.versions.length,
    0
  );
  result.notes.push(`${versionCount} rule versions published`);

  return result;
}
