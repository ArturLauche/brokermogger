/**
 * Weighted request-create reservation against PostgreSQL.
 *
 * Two workflows that each create many requests must share one budget. A
 * rejection must not increment the counter.
 */
import { describe, expect, it } from "vitest";

import {
  readBucketCount,
  reserveBucket,
  reserveWeightedRequestCreate,
} from "@/lib/db/repositories/rateLimit";
import { windowStartFor } from "@/lib/rateLimit";

import { testPrisma } from "../../helpers/db";

const WINDOW_SECONDS = 60;

function identity(key: string, now: Date) {
  return {
    scope: "test.request_create",
    key,
    windowStart: windowStartFor(now, WINDOW_SECONDS),
    windowSeconds: WINDOW_SECONDS,
  };
}

describe("reserveBucket", () => {
  it("adds the requested weight only when it still fits", async () => {
    const now = new Date("2026-08-25T12:00:10.000Z");
    const bucket = identity("weighted-fit", now);

    const first = await reserveBucket(bucket, 3, 5, 0);
    const second = await reserveBucket(bucket, 3, 5, 0);
    const stored = await readBucketCount(bucket);

    expect(first).toEqual({ reserved: true, count: 3 });
    expect(second.reserved).toBe(false);
    expect(stored).toBe(3);
  });

  it("treats existing request rows as the floor so an empty bucket cannot ignore history", async () => {
    const now = new Date("2026-08-25T12:00:10.000Z");
    const bucket = identity("weighted-baseline", now);

    const rejected = await reserveBucket(bucket, 2, 5, 4);
    const accepted = await reserveBucket(bucket, 1, 5, 4);

    expect(rejected.reserved).toBe(false);
    expect(accepted).toEqual({ reserved: true, count: 5 });
  });
});

describe("reserveWeightedRequestCreate", () => {
  it("lets concurrent workflows share one monthly budget by request count", async () => {
    const now = new Date("2026-08-25T12:00:10.000Z");
    const userId = "quota-user-concurrent";
    const daily = {
      ...identity(`daily-${userId}`, now),
      limit: 100,
    };
    const monthly = {
      ...identity(`monthly-${userId}`, now),
      limit: 5,
    };

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        reserveWeightedRequestCreate({
          userId,
          requestedCount: 3,
          daily,
          monthly,
          rollingSince: new Date("2026-07-26T00:00:00.000Z"),
        })
      )
    );

    expect(results.filter((result) => result.reserved)).toHaveLength(1);
    expect(results.filter((result) => !result.reserved)).toHaveLength(3);

    const stored = await testPrisma.rateLimitBucket.findFirstOrThrow({
      where: { scope: monthly.scope, key: monthly.key },
    });
    expect(stored.count).toBe(3);
  });
});
