/**
 * Weighted request-create reservation, verified against an in-memory stand in
 * for the database. Atomic SQL is covered by the integration suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserveWeightedRequestCreate: vi.fn(),
}));

vi.mock("@/lib/db/repositories/rateLimit", () => ({
  incrementBucket: vi.fn(),
  readBucketCount: vi.fn(),
  deleteExpiredBuckets: vi.fn(),
  countExpiredBuckets: vi.fn(),
  reserveWeightedRequestCreate: mocks.reserveWeightedRequestCreate,
}));

const { resetEnvCacheForTests } = await import("@/lib/config/env");
const { reserveRequestCreateQuota } = await import("@/lib/rateLimit");

beforeEach(() => {
  mocks.reserveWeightedRequestCreate.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCacheForTests();
});

describe("reserveRequestCreateQuota", () => {
  const base = {
    userId: "user_ada",
    requestedCount: 40,
    dailyLimit: 25,
    monthlyLimit: 200,
    rollingSince: new Date("2026-07-26T00:00:00.000Z"),
    now: new Date("2026-08-25T12:00:00.000Z"),
  };

  it("reserves the requested count, not one workflow", async () => {
    mocks.reserveWeightedRequestCreate.mockResolvedValueOnce({
      reserved: true,
      rejectedBucket: null,
      rollingCount: 10,
    });

    const result = await reserveRequestCreateQuota({
      ...base,
      requestedCount: 40,
      dailyLimit: 100,
    });

    expect(result.allowed).toBe(true);
    expect(mocks.reserveWeightedRequestCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_ada",
        requestedCount: 40,
        daily: expect.objectContaining({ limit: 100 }),
        monthly: expect.objectContaining({ limit: 200 }),
      })
    );
  });

  it("maps a monthly rejection onto the monthly budget", async () => {
    mocks.reserveWeightedRequestCreate.mockResolvedValueOnce({
      reserved: false,
      rejectedBucket: "monthly",
      rollingCount: 199,
    });

    const result = await reserveRequestCreateQuota(base);

    expect(result.allowed).toBe(false);
    expect(result.bucket).toBe("monthly");
    expect(result.limit).toBe(200);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("still rejects a single workflow that is larger than the daily limit when rate limits are disabled", async () => {
    vi.stubEnv("RATE_LIMIT_ENABLED", "false");
    resetEnvCacheForTests();

    const result = await reserveRequestCreateQuota(base);

    expect(result.allowed).toBe(false);
    expect(result.bucket).toBe("daily");
    expect(mocks.reserveWeightedRequestCreate).not.toHaveBeenCalled();
  });
});
