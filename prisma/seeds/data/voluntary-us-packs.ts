import { US_PRIVACY_PACKS } from "@/lib/jurisdiction/us";
import type { LegalRuleSeed } from "./legal-rules";

/** State law does not remove the option to ask a broker to honor its own policy. */
export function createUsVoluntarySuppressionPacks(base: LegalRuleSeed): LegalRuleSeed[] {
  return ["CA", ...US_PRIVACY_PACKS.map((pack) => pack.region)].map((region) => ({
    ...base,
    jurisdictionCode: `US-${region}`,
    key: "us-voluntary-broker-suppression",
    lawName: "Voluntary broker suppression policy",
    shortName: "Voluntary broker suppression",
    description:
      "A direct request under the recipient's own suppression policy. Separate statutory rights and government-platform submissions retain their own rules.",
    versions: base.versions.map((version) => ({
      ...version,
      supportedRequestTypes: ["SUPPRESSION", "FOLLOW_UP", "FINAL_REMINDER"],
      legalBasisText:
        "your published voluntary suppression policy, without asserting a statutory suppression right or claiming submission to a government deletion platform",
      riskNotes:
        "Verify the recipient's published suppression policy and how to keep it active. This asks for a voluntary restriction on use or display, not proof of erasure. Separate statutory rights must be assessed under their own rule; this request does not establish or waive them. No fixed response deadline or regulator remedy is asserted. The recipient may decline a voluntary request where no separate obligation applies.",
      lastReviewedAt: "2026-09-30T00:00:00.000Z",
      effectiveFrom: "2026-09-30T00:00:00.000Z",
      changeNotes:
        "2026-09-30: retain voluntary broker suppression alongside explicit state-law packs without borrowing a statutory right or government-platform workflow.",
    })),
  }));
}
