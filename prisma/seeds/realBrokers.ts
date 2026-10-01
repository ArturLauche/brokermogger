import type { PrismaClient } from "@prisma/client";
import { REAL_BROKER_DRAFTS, BROKER_SOURCE_REVIEWED_AT } from "./data/real-brokers";
import { loadJurisdictionIds, requireJurisdictionId } from "./jurisdictions";
import { emptyResult, type SeedStepResult } from "./types";

/** Create disabled sourced drafts once. All subsequent decisions belong to the operator. */
export async function seedRealBrokerDrafts(
  prisma: PrismaClient
): Promise<SeedStepResult> {
  const result = emptyResult("Sourced broker drafts");
  const jurisdictions = await loadJurisdictionIds(prisma);
  for (const entry of REAL_BROKER_DRAFTS) {
    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`broker-seed:${entry.slug}`}, 0))`;
      await tx.$executeRaw`SELECT 1 FROM "Broker" WHERE slug = ${entry.slug} FOR UPDATE`;
      if (
        await tx.broker.findUnique({ where: { slug: entry.slug }, select: { id: true } })
      )
        return false;
      await tx.broker.create({
        data: {
          slug: entry.slug,
          legalName: entry.legalName,
          tradingNames: entry.tradingNames,
          websiteUrl: entry.websiteUrl,
          category: entry.category,
          countriesServed: entry.countriesServed,
          sourceUrl: entry.sourceUrl,
          privacyRequestUrl: entry.portalUrl,
          optOutUrl: entry.supportedRequestTypes.includes("SUPPRESSION")
            ? entry.portalUrl
            : null,
          webFormUrl: entry.portalUrl,
          isActive: false,
          isDemoData: false,
          productionSendingEnabled: false,
          productionUnsafeFlag: false,
          verificationStatus: "SOURCE_FOUND",
          lastVerifiedAt: null,
          manualReviewRequired: true,
          confidenceScore: 20,
          riskTier: "STANDARD",
          notes: entry.instructions,
          verificationRequirements: {
            identityDocument: false,
            accountRequired: entry.accountRequired,
            notarised: false,
            notes: entry.instructions,
          },
          knownResponseBehavior: {
            typicalResponseDays: null,
            autoResponder: false,
            commonRejectionReasons: [],
            notes:
              "No response behavior was observed. Published instructions are a source draft, not proof of acceptance or completion.",
          },
          contactMethods: {
            create: {
              type: "PRIVACY_PORTAL_URL",
              value: entry.portalUrl,
              label: entry.portalLabel,
              isPreferred: true,
              isVerified: false,
              isActive: true,
              priority: 10,
              sourceUrl: entry.sourceUrl,
              verificationNote:
                "Source found; operator must verify the intended manual method and minimum fields.",
            },
          },
          jurisdictionCoverage: {
            create: entry.coverageCodes.map((code) => ({
              jurisdictionId: requireJurisdictionId(jurisdictions, code),
              coverageType: "UNKNOWN",
              confidence: "LOW",
              isActive: true,
              supportedRequestTypes: entry.supportedRequestTypes,
              notes:
                "Preparation compatibility only. Statutory applicability and actual method acceptance remain unverified; no real sending is authorized.",
            })),
          },
          seedSources: {
            create: [
              { sourceUrl: entry.sourceUrl, sourceTitle: entry.sourceTitle },
              ...(entry.additionalSources ?? []).map((source) => ({
                sourceUrl: source.url,
                sourceTitle: source.title,
              })),
            ].map((source) => ({
              ...source,
              sourceType: "OFFICIAL_PRIVACY_PAGE",
              isDemo: false,
              retrievedAt: new Date(BROKER_SOURCE_REVIEWED_AT),
              notes:
                "Primary page reviewed for a disabled draft. No submission, login, contact verification or response observation was performed.",
            })),
          },
        },
      });
      return true;
    });
    result[created ? "created" : "skipped"] += 1;
  }
  result.notes.push(
    "Three primary-source drafts start inactive with unverified manual methods and sending disabled. Existing entries and operator decisions are never overwritten."
  );
  return result;
}
