import { describe, expect, it } from "vitest";
import {
  brokerReadiness,
  evaluateBrokerActivation,
  type BrokerReadinessInput,
} from "@/lib/brokers/readiness";
const now = new Date("2026-10-12T12:00:00Z");
const contact = {
  id: "synthetic-method",
  type: "EMAIL" as const,
  value: "privacy@example.org",
  isActive: true,
  isVerified: true,
  verifiedAt: new Date("2026-10-01"),
  sourceUrl: "https://example.org/privacy",
  verificationNote: "Synthetic operator evidence; no external contact.",
};
function broker(overrides: Partial<BrokerReadinessInput> = {}): BrokerReadinessInput {
  return {
    id: "synthetic-broker",
    slug: "synthetic",
    isActive: true,
    isDemoData: false,
    deletedAt: null,
    productionSendingEnabled: false,
    productionUnsafeFlag: false,
    sourceUrl: "https://example.org/privacy",
    lastVerifiedAt: new Date("2026-10-01"),
    verificationStatus: "CONTACT_VERIFIED",
    contactMethods: [contact],
    jurisdictionCoverage: [
      {
        isActive: true,
        coverageType: "STATUTORY",
        supportedRequestTypes: ["DELETION"],
        jurisdiction: { isActive: true },
      },
    ],
    ...overrides,
  };
}
describe("broker readiness and activation", () => {
  it("never treats sourced inactive drafts or fictional examples as eligible", () => {
    const draft = brokerReadiness(
      broker({ isActive: false, verificationStatus: "SOURCE_FOUND" }),
      now
    );
    expect(draft).toMatchObject({
      label: "Inactive real draft",
      canPrepare: false,
      activationReady: false,
    });
    expect(draft.verificationExplanation).toContain("still need verification");
    expect(brokerReadiness(broker({ isDemoData: true }), now)).toMatchObject({
      label: "Fictional example",
      activationReady: false,
    });
  });
  it("separates complete verification from the operator sending switch", () => {
    expect(brokerReadiness(broker(), now)).toMatchObject({
      label: "Verified email · sending off",
      activationReady: true,
    });
    expect(brokerReadiness(broker({ productionSendingEnabled: true }), now).label).toBe(
      "Eligible email contact"
    );
  });
  it.each([
    { verifiedAt: null },
    { verifiedAt: new Date("2027-01-01") },
    { sourceUrl: "https://user:password@example.org/private" },
    { verificationNote: "" },
    { isVerified: false },
    { isActive: false },
    { deletedAt: now },
  ])("does not call incomplete evidence verified: %j", (changes) => {
    expect(
      evaluateBrokerActivation(
        broker({ contactMethods: [{ ...contact, ...changes }] }),
        now
      ).sendable
    ).toBe(false);
    expect(
      brokerReadiness(broker({ contactMethods: [{ ...contact, ...changes }] }), now).label
    ).toBe("Needs operator review");
  });
  it("requires a confirmed type in an active jurisdiction", () => {
    const coverage = broker().jurisdictionCoverage[0]!;
    for (const changes of [
      { coverageType: "UNKNOWN" as const },
      { supportedRequestTypes: [] },
      { isActive: false },
      { jurisdiction: { isActive: false } },
    ]) {
      expect(
        evaluateBrokerActivation(
          broker({ jurisdictionCoverage: [{ ...coverage, ...changes }] }),
          now
        ).sendable
      ).toBe(false);
    }
  });
  it("identifies manual channels without making API automation available", () => {
    expect(
      brokerReadiness(
        broker({
          contactMethods: [
            {
              ...contact,
              type: "PRIVACY_PORTAL_URL",
              value: "https://example.org/privacy",
            },
          ],
        }),
        now
      ).label
    ).toBe("Verified manual method");
    expect(
      brokerReadiness(
        broker({
          contactMethods: [{ ...contact, type: "API", value: "https://example.org/api" }],
        }),
        now
      ).label
    ).toBe("Needs operator review");
  });
  it("flags stale sources without changing existing activation permissions or revealing evidence", () => {
    const old = new Date("2026-01-01");
    const ready = brokerReadiness(
      broker({ lastVerifiedAt: old, contactMethods: [{ ...contact, verifiedAt: old }] }),
      now
    );
    expect(ready.activationReady).toBe(true);
    expect(ready.reviewed.state).toBe("stale");
    expect(ready.warnings).toHaveLength(2);
    expect(JSON.stringify(ready)).not.toContain(contact.verificationNote);
  });
});
