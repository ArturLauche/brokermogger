/**
 * Maps a profile's country and region onto a shipped jurisdiction pack.
 *
 * The function is deterministic and has no I/O. Callers load active
 * jurisdictions and published legal rule versions, then pass them in.
 *
 * Matching order:
 *  1. Exact country + region.
 *  2. Country with a null region; unsupported US states use the voluntary pack.
 * Missing country packs never borrow another country's authority.
 *
 * Unknown countries return null so the UI can ask the user to confirm rather
 * than inventing a right.
 */
import { AppError } from "@/lib/core/errors";
import { normalizeUsState } from "./locations";
import type { RequestChannel } from "@prisma/client";
import { legalRuleAllowsChannel, legalRuleChannels } from "./channels";

import {
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
  const region =
    country === "US" && location.region
      ? normalizeUsState(location.region)
      : normaliseRegion(location.region);
  const active = jurisdictions.filter((item) => item.isActive);
  const notes: string[] = [];

  if (region) {
    const exactRegion = active.find(
      (item) => item.countryCode === country && item.region === region
    );
    if (exactRegion) return { record: exactRegion, notes };
  }

  if (country === "US") {
    const match = active.find((item) => item.code === "US-OTHER");
    if (match) {
      notes.push(
        "No uniform federal deletion right is assumed. This pack offers voluntary requests only; an unsupported state is not assigned another state's rights."
      );
      return { record: match, notes };
    }
    return null;
  }

  const exact = active.find(
    (item) => item.countryCode === country && item.region === null
  );
  if (exact) {
    return { record: exact, notes };
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
  resolved: Pick<ResolvedJurisdiction, "rules">,
  requestType: LegalRuleSnapshot["supportedRequestTypes"][number],
  channel: RequestChannel = "EMAIL"
): LegalRuleSnapshot | null {
  const matches = resolved.rules
    .filter(
      (rule) =>
        rule.supportedRequestTypes.includes(requestType) &&
        legalRuleAllowsChannel(rule.verificationRequirements, channel)
    )
    .sort(
      (a, b) =>
        legalRuleChannels(a.verificationRequirements).length -
          legalRuleChannels(b.verificationRequirements).length ||
        a.legalRuleKey.localeCompare(b.legalRuleKey)
    );
  return matches[0] ?? null;
}
