/**
 * Fixed window rate limiting backed by the `RateLimitBucket` table.
 *
 * Design notes:
 *  - Fixed windows, not sliding windows. A fixed window is one atomic
 *    `INSERT ... ON CONFLICT DO UPDATE` and needs no background maintenance,
 *    which keeps a self hosted instance simple.
 *  - Subject keys are hashed with `hashContextValue()` before they are stored,
 *    so the table never contains a raw email address, IP address or domain.
 *  - `RATE_LIMIT_ENABLED=false` disables enforcement for local debugging. The
 *    decision is still logged at debug level so that the switch is visible.
 */
import { env } from "@/lib/config/env";
import { AppError, RateLimitError } from "@/lib/core/errors";
import {
  countExpiredBuckets,
  deleteExpiredBuckets,
  incrementBucket,
  incrementBuckets,
  readBucketCount,
  reserveWeightedRequestCreate,
  type BucketIncrementer,
} from "@/lib/db/repositories/rateLimit";
import { createLogger } from "@/lib/observability/logger";
import { hashContextValue } from "@/lib/security/crypto";

import type { RateLimitPolicy } from "./policies";
import { requestCreatePerUserDay, requestCreatePerUserMonth } from "./policies";

const log = createLogger("rate-limit");

export interface RateLimitRequest {
  /** Bucket scope, usually `policy.scope`. */
  scope: string;
  /** Raw subject key. Hashed before it reaches the database. */
  key: string;
  limit: number;
  windowSeconds: number;
  /** Injectable clock for tests. */
  now?: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining attempts in the current window, never negative. */
  remaining: number;
  /** Seconds until the current window ends. Zero when the request is allowed. */
  retryAfterSeconds: number;
  limit: number;
}

/** Deterministic window boundary so that every writer agrees on the bucket. */
export function windowStartFor(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function hashKey(scope: string, key: string): string {
  const normalised = key.trim().toLowerCase();
  const hashed = hashContextValue(`ratelimit|${scope}|${normalised}`);
  if (!hashed) {
    throw new Error("Rate limit keys must not be empty.");
  }
  return hashed;
}

function buildResult(
  count: number,
  request: RateLimitRequest,
  windowStart: Date,
  now: Date
): RateLimitResult {
  const windowEnd = windowStart.getTime() + request.windowSeconds * 1000;
  const allowed = count <= request.limit;

  return {
    allowed,
    remaining: Math.max(request.limit - count, 0),
    retryAfterSeconds: allowed
      ? 0
      : Math.max(Math.ceil((windowEnd - now.getTime()) / 1000), 1),
    limit: request.limit,
  };
}

function bypassResult(request: RateLimitRequest, reason: string): RateLimitResult {
  log.debug(
    { scope: request.scope, limit: request.limit, reason },
    "Rate limit not enforced"
  );
  return {
    allowed: true,
    remaining: request.limit,
    retryAfterSeconds: 0,
    limit: request.limit,
  };
}

/**
 * Counts one attempt against the limit and returns the decision. The counter is
 * incremented even when the result is a rejection, so a client that keeps
 * hammering the endpoint stays blocked for the rest of the window.
 */
export async function consume(request: RateLimitRequest): Promise<RateLimitResult> {
  if (!env.RATE_LIMIT_ENABLED) {
    return bypassResult(request, "RATE_LIMIT_ENABLED=false");
  }

  const now = request.now ?? new Date();
  const windowStart = windowStartFor(now, request.windowSeconds);

  const count = await incrementBucket({
    scope: request.scope,
    key: hashKey(request.scope, request.key),
    windowStart,
    windowSeconds: request.windowSeconds,
  });

  const result = buildResult(count, request, windowStart, now);

  if (!result.allowed) {
    log.warn(
      {
        scope: request.scope,
        limit: request.limit,
        windowSeconds: request.windowSeconds,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      "Rate limit reached"
    );
  }

  return result;
}

/** Reads the current state without counting an attempt, for UI display. */
export async function check(request: RateLimitRequest): Promise<RateLimitResult> {
  if (!env.RATE_LIMIT_ENABLED) {
    return bypassResult(request, "RATE_LIMIT_ENABLED=false");
  }

  const now = request.now ?? new Date();
  const windowStart = windowStartFor(now, request.windowSeconds);

  const used = await readBucketCount({
    scope: request.scope,
    key: hashKey(request.scope, request.key),
    windowStart,
  });

  // `used` counts attempts already made, so the next attempt is allowed while
  // the stored value is below the limit and `remaining` is the real budget.
  const windowEnd = windowStart.getTime() + request.windowSeconds * 1000;
  const allowed = used < request.limit;

  return {
    allowed,
    remaining: Math.max(request.limit - used, 0),
    retryAfterSeconds: allowed
      ? 0
      : Math.max(Math.ceil((windowEnd - now.getTime()) / 1000), 1),
    limit: request.limit,
  };
}

export async function consumePolicy(
  policy: RateLimitPolicy,
  key: string,
  overrides: { limit?: number; now?: Date } = {}
): Promise<RateLimitResult> {
  return consume({
    scope: policy.scope,
    key,
    limit: overrides.limit ?? policy.limit,
    windowSeconds: policy.windowSeconds,
    ...(overrides.now ? { now: overrides.now } : {}),
  });
}

/** One attempt against multiple policies, using one clock and one transaction. */
export async function consumePolicies(
  inputs: readonly { policy: RateLimitPolicy; key: string }[],
  now = new Date(),
  increment: BucketIncrementer = incrementBuckets
): Promise<RateLimitResult[]> {
  const requests = inputs.map(({ policy, key }) => ({ ...policy, key }));
  if (!env.RATE_LIMIT_ENABLED)
    return requests.map((request) => bypassResult(request, "RATE_LIMIT_ENABLED=false"));
  const identities = requests.map((request) => ({
    scope: request.scope,
    key: hashKey(request.scope, request.key),
    windowStart: windowStartFor(now, request.windowSeconds),
    windowSeconds: request.windowSeconds,
  }));
  const counts = await increment(identities);
  if (
    counts.length !== identities.length ||
    identities.some(
      (_, index) => !Number.isSafeInteger(counts[index]) || counts[index]! < 1
    )
  ) {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "The rate limit counter results could not be verified.",
    });
  }
  return requests.map((request, index) =>
    buildResult(counts[index]!, request, identities[index]!.windowStart, now)
  );
}

export async function checkPolicy(
  policy: RateLimitPolicy,
  key: string,
  overrides: { limit?: number; now?: Date } = {}
): Promise<RateLimitResult> {
  return check({
    scope: policy.scope,
    key,
    limit: overrides.limit ?? policy.limit,
    windowSeconds: policy.windowSeconds,
    ...(overrides.now ? { now: overrides.now } : {}),
  });
}

/**
 * Consumes one attempt and throws `RateLimitError` when the limit is reached.
 * Use this where the caller has no user friendly fallback path. The sign in
 * flow deliberately does not use it, because it must not reveal whether an
 * address exists.
 */
export async function assertWithinPolicy(
  policy: RateLimitPolicy,
  key: string,
  overrides: { limit?: number; now?: Date } = {}
): Promise<RateLimitResult> {
  const result = await consumePolicy(policy, key, overrides);
  if (!result.allowed) {
    throw new RateLimitError(policy.description, result.retryAfterSeconds);
  }
  return result;
}

/** Cleanup helper for the retention sweep. */
export async function purgeExpiredBuckets(now = new Date()): Promise<number> {
  const removed = await deleteExpiredBuckets(now);
  log.debug({ removed }, "Purged expired rate limit buckets");
  return removed;
}

export async function countExpiredRateLimitBuckets(now = new Date()): Promise<number> {
  return countExpiredBuckets(now);
}

/**
 * Reserves `requestedCount` new removal requests against the daily and monthly
 * fair-use budgets. Unlike `consume()`, a rejection does not increment the
 * counter, and the weight is the number of requests rather than one workflow.
 */
export async function reserveRequestCreateQuota(input: {
  userId: string;
  requestedCount: number;
  dailyLimit: number;
  monthlyLimit: number;
  rollingSince: Date;
  now?: Date;
}): Promise<RateLimitResult & { bucket: "daily" | "monthly" | null }> {
  const now = input.now ?? new Date();
  const dailyPolicy = requestCreatePerUserDay;
  const monthlyPolicy = requestCreatePerUserMonth;
  const dailyWindow = windowStartFor(now, dailyPolicy.windowSeconds);
  const monthlyWindow = windowStartFor(now, monthlyPolicy.windowSeconds);

  if (!env.RATE_LIMIT_ENABLED) {
    log.debug(
      { requestedCount: input.requestedCount, reason: "RATE_LIMIT_ENABLED=false" },
      "Request-create quota not enforced"
    );
    if (input.requestedCount > input.dailyLimit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          Math.ceil(
            (dailyWindow.getTime() + dailyPolicy.windowSeconds * 1000 - now.getTime()) /
              1000
          ),
          1
        ),
        limit: input.dailyLimit,
        bucket: "daily",
      };
    }
    if (input.requestedCount > input.monthlyLimit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 1,
        limit: input.monthlyLimit,
        bucket: "monthly",
      };
    }
    return {
      allowed: true,
      remaining: Math.max(input.dailyLimit - input.requestedCount, 0),
      retryAfterSeconds: 0,
      limit: input.dailyLimit,
      bucket: null,
    };
  }

  const result = await reserveWeightedRequestCreate({
    userId: input.userId,
    requestedCount: input.requestedCount,
    rollingSince: input.rollingSince,
    daily: {
      scope: dailyPolicy.scope,
      key: hashKey(dailyPolicy.scope, input.userId),
      windowStart: dailyWindow,
      windowSeconds: dailyPolicy.windowSeconds,
      limit: input.dailyLimit,
    },
    monthly: {
      scope: monthlyPolicy.scope,
      key: hashKey(monthlyPolicy.scope, input.userId),
      windowStart: monthlyWindow,
      windowSeconds: monthlyPolicy.windowSeconds,
      limit: input.monthlyLimit,
    },
  });

  if (result.reserved) {
    return {
      allowed: true,
      remaining: Math.max(input.dailyLimit - input.requestedCount, 0),
      retryAfterSeconds: 0,
      limit: input.dailyLimit,
      bucket: null,
    };
  }

  const rejectedDaily = result.rejectedBucket === "daily";
  const windowStart = rejectedDaily ? dailyWindow : monthlyWindow;
  const windowSeconds = rejectedDaily
    ? dailyPolicy.windowSeconds
    : monthlyPolicy.windowSeconds;
  const windowEnd = windowStart.getTime() + windowSeconds * 1000;

  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Math.max(Math.ceil((windowEnd - now.getTime()) / 1000), 1),
    limit: rejectedDaily ? input.dailyLimit : input.monthlyLimit,
    bucket: result.rejectedBucket,
  };
}

export {
  brokerSendPerBrokerHour,
  brokerSendPerDomainHour,
  loginErrorPerIp,
  magicLinkPerEmail,
  magicLinkPerIp,
  RATE_LIMIT_POLICIES,
  requestCreatePerBroker30Days,
  requestCreatePerUserDay,
  requestCreatePerUserMonth,
  type RateLimitPolicy,
  type RateLimitPolicyName,
} from "./policies";
