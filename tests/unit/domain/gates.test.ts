import { describe, expect, it } from "vitest";

import { evaluateConsent } from "@/lib/consent/status";
import { evaluateBrokerSendable } from "@/lib/brokers/sendable";
import { evaluateManualReview } from "@/lib/requests/manualReview";
import { assertTransition, canTransition } from "@/lib/requests/stateMachine";
import { backoffSeconds } from "@/lib/jobs/backoff";

describe("consent", () => {
  it("allows a self profile", () => {
    const decision = evaluateConsent({
      profileId: "p1",
      kind: "SELF",
      consentStatus: "SELF",
      consentVerifiedAt: null,
    });
    expect(decision.allowed).toBe(true);
  });

  it("blocks a household adult without verification", () => {
    const pending = evaluateConsent({
      profileId: "p2",
      kind: "HOUSEHOLD_ADULT",
      consentStatus: "PENDING_CONSENT",
      consentVerifiedAt: null,
    });
    expect(pending.allowed).toBe(false);

    const verified = evaluateConsent({
      profileId: "p2",
      kind: "HOUSEHOLD_ADULT",
      consentStatus: "EXPLICIT_CONSENT_OBTAINED",
      consentVerifiedAt: new Date(),
    });
    expect(verified.allowed).toBe(true);
  });

  it("blocks guardian-managed profiles in the MVP", () => {
    expect(
      evaluateConsent({
        profileId: "p3",
        kind: "GUARDIAN_MANAGED_MINOR",
        consentStatus: "GUARDIAN_MANAGED",
        consentVerifiedAt: null,
      }).allowed
    ).toBe(false);
  });
});

describe("broker sendable", () => {
  it("rejects demo brokers", () => {
    const decision = evaluateBrokerSendable({
      id: "b1",
      slug: "demo",
      isActive: true,
      isDemoData: true,
      productionSendingEnabled: false,
      productionUnsafeFlag: false,
      deletedAt: null,
      lastVerifiedAt: new Date(),
      sourceUrl: "https://privacy.example",
      verificationStatus: "CONTACT_VERIFIED",
      contactMethods: [
        {
          type: "EMAIL",
          isActive: true,
          isVerified: true,
          value: "privacy@broker.example",
        },
      ],
      hasJurisdictionCoverage: true,
    });
    expect(decision.sendable).toBe(false);
    expect(decision.reasons.join(" ")).toMatch(/demo data/i);
  });
});

describe("manual review", () => {
  it("flags low confidence and household profiles", () => {
    const decision = evaluateManualReview({
      confidence: "LOW",
      requiresLegalReview: true,
      brokerRequiresId: false,
      profileIsOtherPerson: true,
      consentStatus: "EXPLICIT_CONSENT_OBTAINED",
      includesSensitiveIdentifiers: false,
      hasVerifiedContactMethod: true,
      brokerPreviouslyRejected: false,
      hasCustomText: false,
      targetsRestrictedSource: false,
      riskTier: "STANDARD",
      destinationUnverified: false,
      unusualVolume: false,
    });
    expect(decision.required).toBe(true);
    expect(decision.reasons.length).toBeGreaterThan(1);
  });
});

describe("state machine", () => {
  it("allows the happy path and rejects impossible jumps", () => {
    expect(canTransition("DRAFT", "PREPARED", "USER")).toBe(true);
    expect(canTransition("AWAITING_USER_APPROVAL", "APPROVED", "USER")).toBe(true);
    expect(canTransition("APPROVED", "SENT", "SYSTEM")).toBe(true);
    expect(canTransition("DRAFT", "SENT", "USER")).toBe(false);
    expect(() => assertTransition("CLOSED", "DRAFT", "USER")).toThrow();
  });

  it("does not let a user mark a request as sent", () => {
    expect(canTransition("APPROVED", "SENT", "USER")).toBe(false);
    expect(canTransition("APPROVED", "SENT", "SYSTEM")).toBe(true);
  });
});

describe("backoff", () => {
  it("stays within the cap and is non-zero", () => {
    const delay = backoffSeconds(4, {
      baseSeconds: 10,
      maxSeconds: 40,
      random: () => 0.5,
    });
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(40);
  });
});
