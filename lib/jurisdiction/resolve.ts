/**
 * Maps a profile's country and region onto a shipped jurisdiction pack.
 *
 * The function is deterministic and has no I/O. Callers load active
 * jurisdictions and published legal rule versions, then pass them in.
 *
 * Matching order:
 *  1. Exact country + region (California).
 *  2. Country with a null region (Germany, UK, Brazil, India, Australia,
 *     Singapore).
 *  3. United States without a California region -> US-OTHER.
 *  4. Other EU/EEA countries -> the Germany GDPR representative pack, with a
 *     note that the competent authority may differ.
 *
 * Unknown countries return null so the UI can ask the user to confirm rather
 * than inventing a right.
 */
import { AppError } from "@/lib/core/errors";

import {
  GDPR_REPRESENTATIVE_COUNTRIES,
  lowestConfidence,
  type JurisdictionRecord,
  type LegalRuleSnapshot,
  type ProfileLocation,
  type ResolvedJurisdiction,
} from "./types";

function normaliseRegion(region: string | null | undefined): string | null {
  if (!region) return null;
  const trimmed = region.trim().toUpperCase();
  return trimmed.length === 0 ? null : trimmed;
}

function pickJurisdiction(
  location: ProfileLocation,
  jurisdictions: readonly JurisdictionRecord[]
): { record: JurisdictionRecord; notes: string[] } | null {
  const country = location.countryCode.trim().toUpperCase();
  const region = normaliseRegion(location.region);
  const active = jurisdictions.filter((item) => item.isActive);
  const notes: string[] = [];

  if (country === "US" && region === "CA") {
    const match = active.find((item) => item.code === "US-CA");
    return match ? { record: match, notes } : null;
  }

  if (country === "US") {
    const match = active.find((item) => item.code === "US-OTHER");
    if (match) {
      notes.push(
        "No uniform federal deletion right is assumed. Applicable state law must be confirmed before sending."
      );
      return { record: match, notes };
    }
    return null;
  }

  const exact = active.find(
    (item) =>
      item.countryCode === country && (item.region === null || item.region === region)
  );
  if (exact) {
    return { record: exact, notes };
  }

  if (GDPR_REPRESENTATIVE_COUNTRIES.has(country)) {
    const germany = active.find((item) => item.code === "DE");
    if (germany) {
      notes.push(
        "This country is treated under the GDPR pack represented by Germany. The competent supervisory authority may be a different national authority."
      );
      return { record: germany, notes };
    }
  }

  return null;
}

export function resolveJurisdiction(
  location: ProfileLocation,
  jurisdictions: readonly JurisdictionRecord[],
  rules: readonly LegalRuleSnapshot[]
): ResolvedJurisdiction {
  if (!location.residencyConfirmed) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Confirm residency before a jurisdiction pack can be selected.",
    });
  }

  const picked = pickJurisdiction(location, jurisdictions);
  if (!picked) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message:
        "This country is not in the shipped jurisdiction packs. A maintainer can add it as configuration; the product will not invent a legal right.",
      details: { countryCode: location.countryCode },
    });
  }

  const applied = rules.filter((rule) => rule.jurisdictionId === picked.record.id);

  const types = [...new Set(applied.flatMap((rule) => rule.supportedRequestTypes))];
  const requiresLegalReview =
    applied.some((rule) => rule.requiresLegalReview) || applied.length === 0;
  const confidence = lowestConfidence(applied.map((rule) => rule.confidence));

  return {
    jurisdiction: picked.record,
    rules: applied,
    availableRequestTypes: types,
    requiresLegalReview,
    confidence,
    notes: picked.notes,
  };
}

export function ruleSupportsRequestType(
  resolved: ResolvedJurisdiction,
  requestType: LegalRuleSnapshot["supportedRequestTypes"][number]
): boolean {
  return resolved.availableRequestTypes.includes(requestType);
}

export function primaryRuleForType(
  resolved: ResolvedJurisdiction,
  requestType: LegalRuleSnapshot["supportedRequestTypes"][number]
): LegalRuleSnapshot | null {
  const matches = resolved.rules.filter((rule) =>
    rule.supportedRequestTypes.includes(requestType)
  );
  if (matches.length === 0) return null;
  const withoutDrop = matches.find(
    (rule) => !rule.legalRuleKey.toLowerCase().includes("drop")
  );
  return withoutDrop ?? matches[0] ?? null;
}
