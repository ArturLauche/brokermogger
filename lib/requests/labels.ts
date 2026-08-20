/**
 * Human-readable labels used inside generated letters and the UI.
 * Keep in sync with StatusBadge where the same concept is shown on screen.
 */
import type { IdentifierType, RequestType } from "@prisma/client";

export const IDENTIFIER_TYPE_LABELS: Record<IdentifierType, string> = {
  FULL_NAME: "Full name",
  PREVIOUS_NAME: "Previous name",
  EMAIL: "Email address",
  PHONE: "Phone number",
  POSTAL_ADDRESS: "Postal address",
  PREVIOUS_ADDRESS: "Previous address",
  APPROXIMATE_LOCATION: "Approximate location",
  USERNAME: "Username",
  OTHER: "Other identifier",
};

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  DELETION: "deletion",
  ACCESS: "access",
  CORRECTION: "correction",
  OBJECTION: "objection",
  OPT_OUT: "opt out",
  SUPPRESSION: "suppression",
  CONSENT_WITHDRAWAL: "consent withdrawal",
  FOLLOW_UP: "follow up",
  FINAL_REMINDER: "final reminder",
  ESCALATION: "escalation",
};

export const APPROVAL_CHECKBOX_LABEL =
  "I have reviewed the profile, consent status, destination, legal basis and final request text.";
