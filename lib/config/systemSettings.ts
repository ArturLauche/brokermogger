/**
 * Catalogue of instance settings stored in the `SystemSetting` table.
 *
 * Environment variables configure how the instance runs (secrets, providers,
 * endpoints). System settings configure how the instance behaves and can be
 * changed by an instance admin at runtime. Everything here is operational,
 * nothing here is a paid feature switch.
 */
import { z } from "zod";

export interface SettingDefinition<T> {
  key: string;
  category: "retention" | "fair_use" | "sending" | "follow_up" | "instance";
  description: string;
  schema: z.ZodType<T>;
  defaultValue: T;
  /** Sensitive settings are hidden from the admin UI listing by default. */
  isSensitive?: boolean;
}

function define<T>(definition: SettingDefinition<T>): SettingDefinition<T> {
  return definition;
}

export const SETTINGS = {
  retentionEvidenceMonths: define({
    key: "retention.evidence_months",
    category: "retention",
    description: "How long evidence files are kept after the related request closes.",
    schema: z.number().int().min(1).max(120),
    defaultValue: 24,
  }),
  retentionTemporaryIdFileDays: define({
    key: "retention.temporary_id_file_days",
    category: "retention",
    description:
      "Maximum lifetime of temporary identity documents. They are deleted earlier once the request no longer needs them.",
    schema: z.number().int().min(1).max(180),
    defaultValue: 30,
  }),
  retentionClosedRequestMonths: define({
    key: "retention.closed_request_months",
    category: "retention",
    description: "How long closed removal requests remain in the account.",
    schema: z.number().int().min(1).max(120),
    defaultValue: 24,
  }),
  retentionAuditLogMonths: define({
    key: "retention.audit_log_months",
    category: "retention",
    description:
      "How long audit log entries are kept before the retention sweep removes them.",
    schema: z.number().int().min(6).max(120),
    defaultValue: 24,
  }),
  retentionConsentRecordMonths: define({
    key: "retention.consent_record_months",
    category: "retention",
    description:
      "How long consent evidence is kept. Longer than other records because it is the proof that a request was allowed.",
    schema: z.number().int().min(12).max(180),
    defaultValue: 72,
  }),
  retentionJobLogDays: define({
    key: "retention.job_log_days",
    category: "retention",
    description: "How long background job logs are kept.",
    schema: z.number().int().min(7).max(365),
    defaultValue: 90,
  }),
  retentionEmailLogMonths: define({
    key: "retention.email_log_months",
    category: "retention",
    description: "How long outbound email delivery metadata is kept.",
    schema: z.number().int().min(1).max(60),
    defaultValue: 12,
  }),
  retentionNotificationMonths: define({
    key: "retention.notification_months",
    category: "retention",
    description: "How long in-app notifications are kept.",
    schema: z.number().int().min(1).max(60),
    defaultValue: 12,
  }),

  fairUseRequestsPerDay: define({
    key: "fair_use.requests_per_day",
    category: "fair_use",
    description: "Default number of new requests a user may create per day.",
    schema: z.number().int().min(1).max(1000),
    defaultValue: 25,
  }),
  fairUseRequestsPerMonth: define({
    key: "fair_use.requests_per_month",
    category: "fair_use",
    description: "Default number of new requests a user may create per month.",
    schema: z.number().int().min(1).max(10000),
    defaultValue: 200,
  }),
  fairUseRequestsPerBrokerPer30Days: define({
    key: "fair_use.requests_per_broker_per_30_days",
    category: "fair_use",
    description:
      "How often the same broker may be contacted for one account within 30 days.",
    schema: z.number().int().min(1).max(50),
    defaultValue: 5,
  }),
  fairUseSendsPerDestinationDomainPerHour: define({
    key: "fair_use.sends_per_destination_domain_per_hour",
    category: "fair_use",
    description: "Instance wide throttle per recipient domain, protects deliverability.",
    schema: z.number().int().min(1).max(1000),
    defaultValue: 30,
  }),
  fairUseAccountAgeHoursForBulk: define({
    key: "fair_use.account_age_hours_for_bulk",
    category: "fair_use",
    description:
      "Minimum account age before more than five requests can be created at once.",
    schema: z.number().int().min(0).max(720),
    defaultValue: 24,
  }),

  sendingEnabledByAdmin: define({
    key: "sending.enabled_by_admin",
    category: "sending",
    description:
      "Second switch next to ALLOW_EXTERNAL_SENDING. Both must be true before any broker email leaves the instance.",
    schema: z.boolean(),
    defaultValue: false,
  }),
  sendingMaxPerBrokerPerHour: define({
    key: "sending.max_per_broker_per_hour",
    category: "sending",
    description: "Instance wide sending throttle per broker.",
    schema: z.number().int().min(1).max(500),
    defaultValue: 10,
  }),

  followUpFirstReminderDays: define({
    key: "follow_up.first_reminder_days",
    category: "follow_up",
    description:
      "Days after the response deadline before the first follow up is prepared.",
    schema: z.number().int().min(1).max(90),
    defaultValue: 7,
  }),
  followUpMaxAttempts: define({
    key: "follow_up.max_attempts",
    category: "follow_up",
    description: "Maximum number of prepared follow ups before escalation is suggested.",
    schema: z.number().int().min(0).max(5),
    defaultValue: 2,
  }),
  followUpDeadlineWarningDays: define({
    key: "follow_up.deadline_warning_days",
    category: "follow_up",
    description: "How many days before a deadline the user is notified.",
    schema: z.number().int().min(1).max(30),
    defaultValue: 7,
  }),

  instanceDisplayName: define({
    key: "instance.display_name",
    category: "instance",
    description: "Name shown in the interface and in outgoing notifications.",
    schema: z.string().min(1).max(80),
    defaultValue: "Brokermogger",
  }),
  instanceOperatorNote: define({
    key: "instance.operator_note",
    category: "instance",
    description: "Short note shown on the dashboard, e.g. who operates this instance.",
    schema: z.string().max(400),
    defaultValue: "",
  }),
} as const;

export type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS]["key"];

export const ALL_SETTINGS = Object.values(SETTINGS) as SettingDefinition<unknown>[];

export function findSetting(key: string): SettingDefinition<unknown> | undefined {
  return ALL_SETTINGS.find((setting) => setting.key === key);
}
