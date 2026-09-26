/**
 * Canonical audit action vocabulary.
 *
 * `AuditLog.action` is a string column so that new actions do not require a
 * migration, but every value must come from this list. A unit test asserts
 * that the audit service only ever writes known actions.
 */
export const AUDIT_ACTIONS = [
  // Authentication and account lifecycle
  "auth.magic_link.requested",
  "auth.magic_link.rate_limited",
  "auth.sign_in.succeeded",
  "auth.sign_in.failed",
  "auth.sign_out",
  "auth.session.revoked",
  "account.created",
  "account.updated",
  "account.notification_preferences_updated",
  "account.deletion_requested",
  "account.deletion_completed",
  "account.export_requested",
  "account.export_downloaded",
  "account.role_changed",

  // Profiles, identifiers, consent
  "profile.created",
  "profile.updated",
  "profile.deleted",
  "identifier.created",
  "identifier.updated",
  "identifier.deleted",
  "identifier.revealed",
  "household.member_added",
  "household.member_removed",
  "household.consent_invited",
  "household.consent_verified",
  "household.consent_declined",
  "household.consent_revoked",
  "consent.recorded",

  // Requests
  "request.created",
  "request.rendered",
  "request.downloaded",
  "request.status_changed",
  "request.approved",
  "request.approval_rejected",
  "request.sent",
  "request.send_blocked",
  "request.follow_up_prepared",
  "request.closed",
  "request.manual_review_flagged",
  "request.manual_review_resolved",
  "broker_response.recorded",
  "broker_response.confirmed",
  "broker_response.matched",
  "broker_response.deleted",

  // Evidence and reports
  "evidence.uploaded",
  "evidence.downloaded",
  "evidence.deleted",
  "evidence.purged",
  "report.generated",
  "report.downloaded",

  // Admin and maintainer
  "admin.console_accessed",
  "admin.break_glass_granted",
  "admin.break_glass_revoked",
  "admin.user_data_viewed",
  "admin.user_suspended",
  "admin.broker_created",
  "admin.broker_updated",
  "admin.broker_verification_changed",
  "admin.broker_production_sending_changed",
  "admin.legal_rule_created",
  "admin.legal_rule_version_published",
  "admin.template_created",
  "admin.template_version_published",
  "admin.job_retried",
  "admin.job_cancelled",
  "admin.setting_changed",
  "admin.manual_review_decided",

  // System and security
  "system.job_failed",
  "system.email_bounced",
  "system.email_complaint",
  "system.rate_limit_hit",
  "system.quota_exceeded",
  "system.retention_sweep",
  "security.authorization_denied",
  "security.suspicious_input_detected",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const AUDIT_ACTION_SET: ReadonlySet<string> = new Set(AUDIT_ACTIONS);

export function isAuditAction(value: string): value is AuditAction {
  return AUDIT_ACTION_SET.has(value);
}

/** Resource types used in AuditLog.resourceType. */
export const AUDIT_RESOURCE_TYPES = [
  "user",
  "session",
  "profile",
  "identifier",
  "household_member",
  "household_consent",
  "consent_record",
  "removal_request",
  "broker",
  "broker_response",
  "legal_rule",
  "legal_rule_version",
  "request_template",
  "request_template_version",
  "evidence_file",
  "report",
  "background_job",
  "system_setting",
  "notification",
  "instance",
] as const;

export type AuditResourceType = (typeof AUDIT_RESOURCE_TYPES)[number];
