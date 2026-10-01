/**
 * Production sending preconditions for a broker.
 *
 * Two independent switches must both be on before a broker email leaves the
 * instance: the global `ALLOW_EXTERNAL_SENDING` flag (checked by the email
 * guards) and this per-broker check. Seed data always fails this check.
 */
import type {
  BrokerVerificationStatus,
  ContactMethodType,
  RequestChannel,
} from "@prisma/client";

export const SENDABLE_VERIFICATION: readonly BrokerVerificationStatus[] = [
  "CONTACT_VERIFIED",
  "REQUEST_METHOD_VERIFIED",
  "RESPONSE_BEHAVIOR_VERIFIED",
];

export interface BrokerSendableInput {
  id: string;
  slug: string;
  isActive: boolean;
  isDemoData: boolean;
  productionSendingEnabled: boolean;
  productionUnsafeFlag: boolean;
  deletedAt: Date | null;
  lastVerifiedAt: Date | null;
  sourceUrl: string | null;
  verificationStatus: BrokerVerificationStatus;
  contactMethods: readonly {
    type: ContactMethodType;
    isActive: boolean;
    isVerified: boolean;
    value: string;
    id?: string;
    deletedAt?: Date | null;
    isPreferred?: boolean;
    priority?: number;
  }[];
  hasJurisdictionCoverage: boolean;
}

export interface BrokerSendableDecision {
  sendable: boolean;
  reasons: string[];
}

export function evaluateBrokerSendable(
  broker: BrokerSendableInput
): BrokerSendableDecision {
  const reasons: string[] = [];

  if (broker.deletedAt) reasons.push("The broker record is archived.");
  if (!broker.isActive) reasons.push("The broker is marked inactive.");
  if (broker.productionUnsafeFlag) {
    reasons.push("The broker is flagged as unsafe for production sending.");
  }
  if (broker.isDemoData) {
    reasons.push("This is demo data. Replace it with a verified record before sending.");
  }
  if (!broker.productionSendingEnabled) {
    reasons.push("Production sending is not enabled for this broker.");
  }
  if (!broker.lastVerifiedAt) reasons.push("The broker has no last verified date.");
  if (!broker.sourceUrl) reasons.push("The broker has no source URL.");
  if (!SENDABLE_VERIFICATION.includes(broker.verificationStatus)) {
    reasons.push(
      `Verification status is ${broker.verificationStatus}, which is below CONTACT_VERIFIED.`
    );
  }
  if (!broker.hasJurisdictionCoverage) {
    reasons.push("The broker has no coverage row for this profile's jurisdiction.");
  }

  const verifiedContact = broker.contactMethods.find(
    (method) =>
      !method.deletedAt &&
      method.isActive &&
      method.isVerified &&
      method.value.trim().length > 0
  );
  if (!verifiedContact) {
    reasons.push("No verified contact method is available.");
  }

  return { sendable: reasons.length === 0, reasons };
}

export function preferredContact(
  broker: Pick<BrokerSendableInput, "contactMethods">
): { type: ContactMethodType; value: string } | null {
  const candidates = broker.contactMethods
    .filter(
      (method) => !method.deletedAt && method.isActive && method.value.trim().length > 0
    )
    .sort(
      (a, b) =>
        Number(b.isVerified) - Number(a.isVerified) ||
        Number(b.isPreferred ?? false) - Number(a.isPreferred ?? false) ||
        (a.priority ?? 100) - (b.priority ?? 100) ||
        (a.id ?? `${a.type}:${a.value}`).localeCompare(b.id ?? `${b.type}:${b.value}`)
    );
  const preferred = candidates[0];
  return preferred ? { type: preferred.type, value: preferred.value } : null;
}

const CHANNEL_BY_CONTACT: Record<ContactMethodType, RequestChannel> = {
  EMAIL: "EMAIL",
  WEB_FORM: "WEB_FORM",
  PRIVACY_PORTAL_URL: "WEB_FORM",
  POSTAL: "POSTAL",
  API: "API",
  DROP_PLATFORM: "DROP",
};

export interface RequestDelivery {
  channel: RequestChannel;
  destinationType: ContactMethodType | null;
  destinationValue: string | null;
}

/** New drafts and regenerated correspondence use the same current contact policy. */
export function selectRequestDelivery(
  broker: Pick<BrokerSendableInput, "contactMethods">
): RequestDelivery {
  const contact = preferredContact(broker);
  return {
    channel: contact ? CHANNEL_BY_CONTACT[contact.type] : "EMAIL",
    destinationType: contact?.type ?? null,
    destinationValue: contact?.value ?? null,
  };
}
