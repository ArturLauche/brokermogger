import {
  GDPR_COUNTRIES,
  EDPB_AUTHORITY_DIRECTORY,
  EDPB_RIGHTS_GUIDE,
  EEA_GDPR_COMMENCEMENT_SOURCE,
} from "@/lib/jurisdiction/eea";
import type { LegalRuleSeed } from "./legal-rules";

/** One shared GDPR definition, with explicit country scope and authority routing. */
export function createGdprPacks(definitions: readonly LegalRuleSeed[]): LegalRuleSeed[] {
  return GDPR_COUNTRIES.flatMap((country) =>
    definitions.map((definition) => ({
      ...definition,
      jurisdictionCode: country.code,
      description: `${definition.description} Country pack: ${country.name}. National derogations and recipient applicability require review.`,
      versions: definition.versions.map((version) => ({
        ...version,
        effectiveFrom: country.eeaEfta
          ? "2018-07-20T00:00:00.000Z"
          : "2018-05-25T00:00:00.000Z",
        escalationAuthority: country.authority,
        escalationUrl: country.authorityUrl,
        escalationPath: `The individual may review a complaint under GDPR Article 77 with a competent supervisory authority, including in their habitual residence, place of work or the alleged infringement. For ${country.name}, start with ${country.authority}. ${country.authorityNote ?? "Check territorial and cross-border competence before filing."} Brokermogger prepares information only; the individual submits any complaint themselves.`,
        riskNotes: `${version.riskNotes} This pack covers the shared GDPR baseline for ${country.name}, not every national derogation or sector-specific rule. Confirm Article 3 territorial scope, the recipient's role and applicable exceptions. ${country.authorityNote ?? "Cross-border supervision may involve a different lead authority."} Suppression means restricting marketing or another agreed use; it is not proof of erasure. Holiday coverage is unverified and calculated targets remain estimates.`,
        sourceUrl: EDPB_RIGHTS_GUIDE,
        sourceTitle:
          "European Data Protection Board, handling individual rights under the GDPR",
        additionalSources: [
          {
            title: "Regulation (EU) 2016/679, Chapter III",
            url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
          },
          {
            title: "EDPB, national and EEA supervisory authority directory",
            url: EDPB_AUTHORITY_DIRECTORY,
          },
          { title: `${country.name}: ${country.authority}`, url: country.authorityUrl },
          ...(country.eeaEfta
            ? [
                {
                  title: "EFTA, GDPR commencement in Iceland, Liechtenstein and Norway",
                  url: EEA_GDPR_COMMENCEMENT_SOURCE,
                },
              ]
            : []),
        ],
        lastReviewedAt: "2026-09-30T00:00:00.000Z",
        changeNotes:
          "Shared GDPR rights and EDPB authority directory reviewed on 2026-09-30. Explicit country routing replaces the Germany fallback; EEA EFTA commencement is 2018-07-20. National derogations and holiday calendars require separate review.",
      })),
    }))
  );
}
