/** Catalogue readiness uses the same requirements as explicit operator activation. */
import type { BrokerVerificationStatus, CoverageType, RequestType } from "@prisma/client";
import { BROKER_REVIEW_INTERVAL_DAYS, reviewAge } from "@/lib/catalogue/reviewAge";
import { isValidEmailAddress } from "@/lib/security/sanitize";
import { publicUrlSchema } from "@/lib/validation/publicUrl";
import { evaluateBrokerSendable, type BrokerSendableInput } from "./sendable";

export const BROKER_VERIFICATION_EXPLANATIONS: Record<BrokerVerificationStatus, string> =
  {
    UNVERIFIED: "No contact or request method has been verified.",
    SOURCE_FOUND:
      "A source has been discovered. Contact details and request methods still need verification.",
    CONTACT_VERIFIED:
      "Contact verification is recorded. This does not establish how the broker will respond.",
    REQUEST_METHOD_VERIFIED:
      "A request method has been reviewed. A completed removal is not established by this status.",
    RESPONSE_BEHAVIOR_VERIFIED:
      "Observed response behavior is recorded. A future request can have a different outcome.",
    INACTIVE:
      "The entry is inactive. An operator must review it before preparing new requests.",
    DEPRECATED: "The entry is deprecated and needs operator review before use.",
  };

export type ReadinessContact = BrokerSendableInput["contactMethods"][number] & {
  verifiedAt: Date | null;
  sourceUrl: string | null;
  verificationNote: string | null;
};
export type ReadinessCoverage = {
  isActive: boolean;
  coverageType: CoverageType;
  supportedRequestTypes: readonly RequestType[];
  jurisdiction: { isActive: boolean };
};
export type BrokerReadinessInput = Omit<
  BrokerSendableInput,
  "contactMethods" | "hasJurisdictionCoverage"
> & {
  contactMethods: readonly ReadinessContact[];
  jurisdictionCoverage: readonly ReadinessCoverage[];
};

export function contactVerificationComplete(method: ReadinessContact, now = new Date()) {
  return !!(
    !method.deletedAt &&
    method.isActive &&
    method.isVerified &&
    method.value.trim() &&
    method.verifiedAt &&
    method.verifiedAt <= now &&
    method.verificationNote &&
    method.verificationNote.length >= 10 &&
    publicUrlSchema.safeParse(method.sourceUrl).success
  );
}

export function confirmedCatalogueCoverage(row: ReadinessCoverage) {
  return (
    row.isActive &&
    row.jurisdiction.isActive &&
    row.coverageType !== "UNKNOWN" &&
    row.supportedRequestTypes.length > 0
  );
}

export function evaluateBrokerActivation(broker: BrokerReadinessInput, now = new Date()) {
  return evaluateBrokerSendable({
    ...broker,
    productionSendingEnabled: true,
    contactMethods: broker.contactMethods.filter((method) =>
      contactVerificationComplete(method, now)
    ),
    hasJurisdictionCoverage: broker.jurisdictionCoverage.some(confirmedCatalogueCoverage),
  });
}

export function brokerReadiness(broker: BrokerReadinessInput, now = new Date()) {
  const activation = evaluateBrokerActivation(broker, now);
  const contacts = broker.contactMethods.filter((method) =>
    contactVerificationComplete(method, now)
  );
  const email = contacts.some(
    (method) => method.type === "EMAIL" && isValidEmailAddress(method.value)
  );
  const manual = contacts.some((method) =>
    ["WEB_FORM", "PRIVACY_PORTAL_URL", "POSTAL", "DROP_PLATFORM"].includes(method.type)
  );
  const canPrepare = broker.isActive && !broker.deletedAt;
  const label = broker.isDemoData
    ? "Fictional example"
    : !canPrepare
      ? broker.verificationStatus === "UNVERIFIED" ||
        broker.verificationStatus === "SOURCE_FOUND"
        ? "Inactive real draft"
        : "Inactive real entry"
      : activation.sendable && email
        ? broker.productionSendingEnabled
          ? "Eligible email contact"
          : "Verified email · sending off"
        : activation.sendable && manual
          ? "Verified manual method"
          : "Needs operator review";
  const description = broker.isDemoData
    ? "Use this fictional entry to practise the workflow with simulated delivery. It cannot contact a real broker."
    : !canPrepare
      ? "Request preparation is unavailable until an operator reviews and activates this entry. You can read the public sources and check the official manual instructions yourself."
      : activation.sendable && email
        ? "A verified email contact is recorded. Delivery still requires an approved message, current consent and all instance sending gates. Provider acceptance does not prove receipt or removal."
        : activation.sendable && manual
          ? "A verified manual method is recorded. Prepare and approve the text, submit it yourself through the official channel, then record submission and receipt separately."
          : "You may prepare a draft, but missing verification or coverage needs review before submission. Check the official source for lawful manual options.";
  const reviewed = reviewAge(broker.lastVerifiedAt, BROKER_REVIEW_INTERVAL_DAYS, now);
  const staleContacts = contacts.filter(
    (method) =>
      reviewAge(method.verifiedAt, BROKER_REVIEW_INTERVAL_DAYS, now).state === "stale"
  ).length;
  return {
    label,
    description,
    canPrepare,
    activationReady: activation.sendable,
    blockingReasons: activation.reasons.map((reason) =>
      reason === "The broker has no coverage row for this profile's jurisdiction."
        ? "No active jurisdiction coverage confirms a supported request type."
        : reason
    ),
    verificationExplanation: BROKER_VERIFICATION_EXPLANATIONS[broker.verificationStatus],
    reviewed,
    warnings: [
      ...(reviewed.state === "stale"
        ? [
            "The broker review is at least 90 days old. Recheck its source and instructions.",
          ]
        : []),
      ...(reviewed.state === "future"
        ? ["Correct the future broker review date before relying on this record."]
        : []),
      ...(staleContacts
        ? [
            `${staleContacts} verified ${staleContacts === 1 ? "method needs" : "methods need"} a fresh source review (at least 90 days old).`,
          ]
        : []),
    ],
  };
}
export type BrokerReadiness = ReturnType<typeof brokerReadiness>;
