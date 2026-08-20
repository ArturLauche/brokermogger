/**
 * Named rate limit policies.
 *
 * Limits in Brokermogger are operational fair use only. They protect the
 * instance and the deliverability of its sending domain, they are never a
 * monetisation mechanism, and the UI always explains them in plain language.
 *
 * Where an instance admin can change a limit at runtime the default is read
 * from `lib/config/systemSettings.ts` so that there is a single source of truth.
 * The remaining policies protect the sign in endpoint itself and are therefore
 * not runtime configurable.
 */
import { SETTINGS } from "@/lib/config/systemSettings";

export interface RateLimitPolicy {
  /** Stable name used in logs, audit metadata and tests. */
  name: string;
  /** Bucket scope stored in `RateLimitBucket.scope`. */
  scope: string;
  limit: number;
  windowSeconds: number;
  /** Sentence shown to the user when the limit is reached. */
  description: string;
  /** System setting the default came from, when one exists. */
  settingKey?: string;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function definePolicy(policy: RateLimitPolicy): RateLimitPolicy {
  return policy;
}

/**
 * Three magic links per address per 15 minutes. Mirrors the per account
 * `UserQuota.magicLinksPer15Minutes` default so that a signed out request and a
 * signed in request behave the same way.
 */
export const magicLinkPerEmail = definePolicy({
  name: "magicLinkPerEmail",
  scope: "auth.magic_link.email",
  limit: 3,
  windowSeconds: 15 * MINUTE,
  description:
    "Up to three sign in links per address every 15 minutes. Please use the most recent link.",
});

export const magicLinkPerIp = definePolicy({
  name: "magicLinkPerIp",
  scope: "auth.magic_link.ip",
  limit: 10,
  windowSeconds: HOUR,
  description: "Up to ten sign in links per network per hour.",
});

export const loginErrorPerIp = definePolicy({
  name: "loginErrorPerIp",
  scope: "auth.login_error.ip",
  limit: 20,
  windowSeconds: HOUR,
  description: "Up to twenty failed sign in attempts per network per hour.",
});

/** Reserved for the request creation slice. */
export const requestCreatePerUserDay = definePolicy({
  name: "requestCreatePerUserDay",
  scope: "request.create.user_day",
  limit: SETTINGS.fairUseRequestsPerDay.defaultValue,
  windowSeconds: DAY,
  description: "Fair use limit for new requests per day.",
  settingKey: SETTINGS.fairUseRequestsPerDay.key,
});

/** Reserved for the request creation slice. */
export const requestCreatePerUserMonth = definePolicy({
  name: "requestCreatePerUserMonth",
  scope: "request.create.user_month",
  limit: SETTINGS.fairUseRequestsPerMonth.defaultValue,
  windowSeconds: 30 * DAY,
  description: "Fair use limit for new requests per month.",
  settingKey: SETTINGS.fairUseRequestsPerMonth.key,
});

/** Reserved for the request creation slice. Protects a single broker inbox. */
export const requestCreatePerBroker30Days = definePolicy({
  name: "requestCreatePerBroker30Days",
  scope: "request.create.broker_30_days",
  limit: SETTINGS.fairUseRequestsPerBrokerPer30Days.defaultValue,
  windowSeconds: 30 * DAY,
  description: "Fair use limit for contacting the same broker again within 30 days.",
  settingKey: SETTINGS.fairUseRequestsPerBrokerPer30Days.key,
});

/** Reserved for the broker sending slice. Protects recipient domains. */
export const brokerSendPerDomainHour = definePolicy({
  name: "brokerSendPerDomainHour",
  scope: "broker.send.domain_hour",
  limit: SETTINGS.fairUseSendsPerDestinationDomainPerHour.defaultValue,
  windowSeconds: HOUR,
  description: "Instance wide throttle per recipient domain, protects deliverability.",
  settingKey: SETTINGS.fairUseSendsPerDestinationDomainPerHour.key,
});

/** Reserved for the broker sending slice. Protects a single broker. */
export const brokerSendPerBrokerHour = definePolicy({
  name: "brokerSendPerBrokerHour",
  scope: "broker.send.broker_hour",
  limit: SETTINGS.sendingMaxPerBrokerPerHour.defaultValue,
  windowSeconds: HOUR,
  description: "Instance wide sending throttle per broker.",
  settingKey: SETTINGS.sendingMaxPerBrokerPerHour.key,
});

export const RATE_LIMIT_POLICIES = {
  magicLinkPerEmail,
  magicLinkPerIp,
  loginErrorPerIp,
  requestCreatePerUserDay,
  requestCreatePerUserMonth,
  requestCreatePerBroker30Days,
  brokerSendPerDomainHour,
  brokerSendPerBrokerHour,
} as const;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;
