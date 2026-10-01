/**
 * Jurisdiction resolution types.
 *
 * The resolver is a pure function of a profile's country and region plus the
 * jurisdiction rows loaded from the database. Adding a jurisdiction is a data
 * change, not a code change.
 */
import type { LegalConfidence, RequestType } from "@prisma/client";

export interface JurisdictionRecord {
  id: string;
  code: string;
  name: string;
  countryCode: string;
  region: string | null;
  isActive: boolean;
}

export interface LegalRuleSnapshot {
  legalRuleId: string;
  legalRuleVersionId: string;
  legalRuleKey: string;
  jurisdictionId: string;
  lawName: string;
  version: number;
  supportedRequestTypes: RequestType[];
  legalBasisText: string;
  deadlineDays: number | null;
  deadlineRule: unknown;
  verificationRequirements: unknown;
  escalationPath: string;
  escalationAuthority: string | null;
  escalationUrl: string | null;
  templateClauses: unknown;
  riskNotes: string;
  requiresLegalReview: boolean;
  confidence: LegalConfidence;
  sourceUrl: string;
  sourceTitle: string;
  lastReviewedAt: Date;
  reviewedBy: string;
}

export interface ProfileLocation {
  countryCode: string;
  region: string | null;
  residencyConfirmed: boolean;
}

export interface ResolvedJurisdiction {
  jurisdiction: JurisdictionRecord;
  /** Published legal rule versions that currently apply. */
  rules: LegalRuleSnapshot[];
  availableRequestTypes: RequestType[];
  /** Highest review flag among the applied rules. */
  requiresLegalReview: boolean;
  /** Lowest confidence among the applied rules. */
  confidence: LegalConfidence;
  notes: string[];
}

export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  DE: "Germany",
  GB: "United Kingdom",
  BR: "Brazil",
  IN: "India",
  AU: "Australia",
  SG: "Singapore",
  AT: "Austria",
  BE: "Belgium",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  IE: "Ireland",
  PT: "Portugal",
  PL: "Poland",
  SE: "Sweden",
  DK: "Denmark",
  FI: "Finland",
  GR: "Greece",
  CZ: "Czechia",
  HU: "Hungary",
  RO: "Romania",
  LU: "Luxembourg",
  BG: "Bulgaria",
  CY: "Cyprus",
  EE: "Estonia",
  HR: "Croatia",
  LT: "Lithuania",
  LV: "Latvia",
  MT: "Malta",
  SI: "Slovenia",
  SK: "Slovakia",
  IS: "Iceland",
  LI: "Liechtenstein",
  NO: "Norway",
};

export function countryDisplayName(countryCode: string): string {
  return COUNTRY_NAMES[countryCode] ?? countryCode;
}

export function confidenceRank(confidence: LegalConfidence): number {
  switch (confidence) {
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
    default:
      return 0;
  }
}

export function lowestConfidence(values: LegalConfidence[]): LegalConfidence {
  if (values.length === 0) return "LOW";
  return values.reduce((lowest, current) =>
    confidenceRank(current) < confidenceRank(lowest) ? current : lowest
  );
}
