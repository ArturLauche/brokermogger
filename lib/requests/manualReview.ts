/**
 * Self-service manual review triggers.
 *
 * Manual review in the MVP is not a platform lawyer. It means the signed in
 * user (or an instance admin on a self-hosted instance) must read the request
 * before it can be approved. Triggers are listed so the UI can explain why.
 */
import type { BrokerRiskTier, ConsentStatus, LegalConfidence } from "@prisma/client";

export interface ManualReviewInput {
  brokerManualReviewRequired?: boolean;
  coverageUnconfirmed?: boolean;
  confidence: LegalConfidence;
  requiresLegalReview: boolean;
  brokerRequiresId: boolean;
  profileIsOtherPerson: boolean;
  consentStatus: ConsentStatus;
  includesSensitiveIdentifiers: boolean;
  hasVerifiedContactMethod: boolean;
  brokerPreviouslyRejected: boolean;
  hasCustomText: boolean;
  targetsRestrictedSource: boolean;
  riskTier: BrokerRiskTier;
  destinationUnverified: boolean;
  unusualVolume: boolean;
}

export interface ManualReviewDecision {
  required: boolean;
  reasons: string[];
}

export function evaluateManualReview(input: ManualReviewInput): ManualReviewDecision {
  const reasons: string[] = [];
  if (input.brokerManualReviewRequired)
    reasons.push(
      "The broker catalogue requires manual review. Check its current instructions and operator notes."
    );
  if (input.coverageUnconfirmed)
    reasons.push(
      "This request type has not been confirmed for the broker in this jurisdiction. Preparation is for review only; real email dispatch remains blocked."
    );
  if (input.riskTier === "ELEVATED")
    reasons.push("The broker is in an elevated review category.");

  if (input.confidence === "LOW") {
    reasons.push("The applied legal rule has low confidence.");
  }
  if (input.requiresLegalReview) {
    reasons.push("The applied legal rule is flagged as requiring legal review.");
  }
  if (input.brokerRequiresId) {
    reasons.push("The broker is recorded as requiring identity proof.");
  }
  if (input.profileIsOtherPerson) {
    reasons.push("This request is for a household profile, not the account holder.");
  }
  if (
    input.consentStatus !== "SELF" &&
    input.consentStatus !== "EXPLICIT_CONSENT_OBTAINED"
  ) {
    reasons.push("Consent for this profile is not in a sendable state.");
  }
  if (input.includesSensitiveIdentifiers) {
    reasons.push("The draft includes identifiers marked sensitive.");
  }
  if (!input.hasVerifiedContactMethod) {
    reasons.push("The destination contact method is not verified.");
  }
  if (input.brokerPreviouslyRejected) {
    reasons.push(
      "This broker has previously rejected a similar request from this account."
    );
  }
  if (input.hasCustomText) {
    reasons.push(
      "The template contains custom text that was not taken from a published version."
    );
  }
  if (input.targetsRestrictedSource || input.riskTier === "RESTRICTED") {
    reasons.push(
      "The broker is in a restricted category (credit, court, public record or fraud data)."
    );
  }
  if (input.destinationUnverified) {
    reasons.push("The destination address has not been verified.");
  }
  if (input.unusualVolume) {
    reasons.push(
      "Request volume for this account is unusual relative to the fair use window."
    );
  }

  return { required: reasons.length > 0, reasons };
}
