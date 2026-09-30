import { FUTURE_US_PRIVACY_PACKS } from "@/lib/jurisdiction/futureUs";
import { usPackName } from "@/lib/jurisdiction/us";
import type { LegalRuleSeed } from "./legal-rules";
import { createUsPrivacyPacks } from "./us-packs";

/** Preserve voluntary requests while enacted statutory rules await review/publication. */
export function createFutureUsPacks(voluntary: LegalRuleSeed): LegalRuleSeed[] {
  return [
    ...createUsPrivacyPacks(FUTURE_US_PRIVACY_PACKS, {
      status: "DRAFT",
      reviewedAt: "2026-10-01T00:00:00.000Z",
    }),
    ...FUTURE_US_PRIVACY_PACKS.map((pack) => ({
      ...voluntary,
      jurisdictionCode: `US-${pack.region}`,
      description: `${usPackName(pack)}: requests under the broker's own policy while the separately sourced future statutory pack remains unpublished.`,
      versions: voluntary.versions.map((version) => ({
        ...version,
        legalBasisText:
          "your published voluntary opt-out and suppression policy, without asserting a statutory right or the commencement of an unpublished future-law pack",
        riskNotes: `${version.riskNotes} ${pack.lawName} has a separately verified future commencement date and is seeded as an unpublished draft. This voluntary request does not assert rights under that Act, even after its commencement if the operator has not published the statutory pack.`,
        sourceUrl: pack.sourceUrl,
        sourceTitle: `${pack.sourceTitle}; voluntary request before statutory publication`,
        additionalSources: [
          ...version.additionalSources,
          { title: "Voluntary request basis", url: version.sourceUrl },
          ...(pack.additionalSources ?? []),
        ],
        lastReviewedAt: "2026-10-01T00:00:00.000Z",
        effectiveFrom: version.effectiveFrom,
        changeNotes:
          "2026-10-01: preserve clearly labelled voluntary opt-out/suppression while the future statutory pack requires operator review and publication. No fixed response deadline is asserted.",
      })),
    })),
  ];
}
