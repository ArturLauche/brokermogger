import { DEFAULT_LEGAL_SOURCE } from "@/lib/jurisdiction/authoring";

/** Synthetic configuration, with real primary URLs but no claim of legal review. */
export const syntheticLegalSource = () => ({
  ...DEFAULT_LEGAL_SOURCE,
  legalBasisText:
    "Article 17 of Regulation (EU) 2016/679 where its scope and conditions apply",
  riskNotes:
    "Synthetic test rule. Verify territorial scope, controller identity and applicable exceptions before relying on a legal right.",
  escalationPath:
    "Review the actual authority guidance and prepare a complaint manually. This fixture never contacts an authority.",
  sourceUrl: "https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng",
  sourceTitle: "Synthetic fixture referencing Regulation (EU) 2016/679",
  lastReviewedOn: new Date().toISOString().slice(0, 10),
  reviewedBy: "Synthetic test fixture, not reviewed by counsel",
  effectiveFrom: "2018-05-25T00:00:00.000Z",
  changeNotes: "Synthetic test review of rendering, timing, sources and scope.",
});
