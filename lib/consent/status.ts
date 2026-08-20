/**
 * Household and self-profile consent gates.
 *
 * Consent is checked twice: when a request is generated and again immediately
 * before anything is sent. A pending invitation, a revoked record or a
 * guardian-managed (blocked in the MVP) profile cannot produce an outbound
 * message.
 */
import type { ConsentStatus, ProfileKind } from "@prisma/client";

import { ConsentError } from "@/lib/core/errors";

export const SENDABLE_CONSENT: readonly ConsentStatus[] = [
  "SELF",
  "EXPLICIT_CONSENT_OBTAINED",
];

export interface ConsentSnapshot {
  profileId: string;
  kind: ProfileKind;
  consentStatus: ConsentStatus;
  /** For household adults: when the double opt-in was confirmed. */
  consentVerifiedAt: Date | null;
}

export interface ConsentDecision {
  allowed: boolean;
  status: ConsentStatus;
  reason: string;
}

export function evaluateConsent(snapshot: ConsentSnapshot): ConsentDecision {
  if (snapshot.kind === "GUARDIAN_MANAGED_MINOR") {
    return {
      allowed: false,
      status: snapshot.consentStatus,
      reason:
        "Children's data is not collected in this version. Guardian-managed profiles cannot be used.",
    };
  }

  if (snapshot.kind === "SELF") {
    if (snapshot.consentStatus !== "SELF") {
      return {
        allowed: false,
        status: snapshot.consentStatus,
        reason: "A self profile must carry the SELF consent status.",
      };
    }
    return {
      allowed: true,
      status: "SELF",
      reason: "The account holder is acting for themselves.",
    };
  }

  switch (snapshot.consentStatus) {
    case "EXPLICIT_CONSENT_OBTAINED":
      if (!snapshot.consentVerifiedAt) {
        return {
          allowed: false,
          status: snapshot.consentStatus,
          reason:
            "Explicit consent is marked but has no verification timestamp. Send a new invitation.",
        };
      }
      return {
        allowed: true,
        status: "EXPLICIT_CONSENT_OBTAINED",
        reason: "The represented adult confirmed the invitation.",
      };
    case "PENDING_CONSENT":
      return {
        allowed: false,
        status: "PENDING_CONSENT",
        reason:
          "This person has not yet accepted the invitation. Requests cannot be generated or sent until they do.",
      };
    case "NOT_ALLOWED":
      return {
        allowed: false,
        status: "NOT_ALLOWED",
        reason: "Consent for this profile was declined or revoked.",
      };
    case "GUARDIAN_MANAGED":
      return {
        allowed: false,
        status: "GUARDIAN_MANAGED",
        reason: "Guardian-managed profiles are not available in this version.",
      };
    case "SELF":
      return {
        allowed: false,
        status: "SELF",
        reason: "A household profile cannot use the SELF consent status.",
      };
    default:
      return {
        allowed: false,
        status: snapshot.consentStatus,
        reason: "Consent status is not recognised.",
      };
  }
}

export function assertConsentAllowsRequests(snapshot: ConsentSnapshot): ConsentDecision {
  const decision = evaluateConsent(snapshot);
  if (!decision.allowed) {
    throw new ConsentError(decision.reason, {
      profileId: snapshot.profileId,
      consentStatus: snapshot.consentStatus,
    });
  }
  return decision;
}

export function isSendableConsent(status: ConsentStatus): boolean {
  return SENDABLE_CONSENT.includes(status);
}
