export const SENSITIVE_EXPORT_NOTICE =
  "I want a JSON copy containing my unmasked account and profile details, identifiers, complete stored letters and replies, and private correspondence metadata. File contents are downloaded separately; this copy includes their details and private download paths. The copy is encrypted on this instance, available only to my signed-in account for 24 hours after generation, then scheduled for deletion. The downloaded JSON is unencrypted; I will keep it private.";
export const EXPORT_NOTICE_VERSION = 1;
export const EXPORT_SECTIONS = [
  "account",
  "profiles",
  "identifiers",
  "householdMembers",
  "householdConsents",
  "consents",
  "requests",
  "snapshots",
  "requestEvents",
  "manualSubmissions",
  "responses",
  "evidenceFiles",
  "reports",
  "notifications",
  "outboundMessages",
  "webhookEvents",
  "receivingAddresses",
  "sessions",
  "linkedAccounts",
  "quota",
  "audit",
  "administrativeAccess",
  "jobs",
  "exports",
] as const;
export type ExportSection = (typeof EXPORT_SECTIONS)[number];
