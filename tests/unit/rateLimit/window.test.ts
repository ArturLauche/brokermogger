/**
 * Fixed window behaviour, verified against an in-memory stand in for the
 * database. The integration test covers the atomicity of the real statement;
 * this test covers the arithmetic and the key hashing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => new Map<string, number>());

vi.mock("@/lib/db/repositories/rateLimit", () => ({
  incrementBucket: vi.fn(
    async (identity: {
      scope: string;
      key: string;
      windowStart: Date;
      windowSeconds: number;
    }) => {
      const id = `${identity.scope}|${identity.key}|${identity.windowStart.toISOString()}`;
      const next = (store.get(id) ?? 0) + 1;
      store.set(id, next);
      return next;
    }
  ),
  readBucketCount: vi.fn(
    async (identity: { scope: string; key: string; windowStart: Date }) =>
      store.get(
        `${identity.scope}|${identity.key}|${identity.windowStart.toISOString()}`
      ) ?? 0
  ),
  deleteExpiredBuckets: vi.fn(async () => 0),
  countExpiredBuckets: vi.fn(async () => 0),
  reserveWeightedRequestCreate: vi.fn(),
  reserveBucket: vi.fn(),
}));

const { resetEnvCacheForTests } = await import("@/lib/config/env");
const { check, consume, consumePolicy, magicLinkPerEmail, windowStartFor } =
  await import("@/lib/rateLimit");

const WINDOW_SECONDS = 60;
const base = {
  scope: "test.scope",
  key: "ada@example.org",
  limit: 3,
  windowSeconds: WINDOW_SECONDS,
};

beforeEach(() => {
  store.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCacheForTests();
});

describe("fixed windows", () => {
  it("aligns the window start to the window size", () => {
    const start = windowStartFor(new Date("2026-08-15T12:34:56.789Z"), WINDOW_SECONDS);
    expect(start.toISOString()).toBe("2026-08-15T12:34:00.000Z");
  });

  it("allows up to the limit, then blocks", async () => {
    const now = new Date("2026-08-15T12:00:10.000Z");

    const first = await consume({ ...base, now });
    const second = await consume({ ...base, now });
    const third = await consume({ ...base, now });
    const fourth = await consume({ ...base, now });

    expect([first.allowed, second.allowed, third.allowed]).toEqual([true, true, true]);
    expect([first.remaining, second.remaining, third.remaining]).toEqual([2, 1, 0]);
    expect(first.limit).toBe(3);

    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.retryAfterSeconds).toBe(50);
  });

  it("starts fresh in the next window", async () => {
    const inFirstWindow = new Date("2026-08-15T12:00:10.000Z");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await consume({ ...base, now: inFirstWindow });
    }

    const inSecondWindow = new Date("2026-08-15T12:01:05.000Z");
    const afterRollover = await consume({ ...base, now: inSecondWindow });

    expect(afterRollover.allowed).toBe(true);
    expect(afterRollover.remaining).toBe(2);
    expect(afterRollover.retryAfterSeconds).toBe(0);
  });

  it("separates scopes and keys", async () => {
    const now = new Date("2026-08-15T12:00:10.000Z");
    await consume({ ...base, now });
    await consume({ ...base, now });
    await consume({ ...base, now });

    const otherKey = await consume({ ...base, key: "grace@example.org", now });
    const otherScope = await consume({ ...base, scope: "other.scope", now });

    expect(otherKey.allowed).toBe(true);
    expect(otherScope.allowed).toBe(true);
  });
});

describe("check", () => {
  it("reports the state without counting an attempt", async () => {
    const now = new Date("2026-08-15T12:00:10.000Z");
    await consume({ ...base, now });

    const preview = await check({ ...base, now });
    expect(preview.allowed).toBe(true);
    expect(preview.remaining).toBe(2);

    const again = await check({ ...base, now });
    expect(again.remaining).toBe(2);
  });

  it("reports a blocked state once the limit is used up", async () => {
    const now = new Date("2026-08-15T12:00:10.000Z");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await consume({ ...base, now });
    }

    const preview = await check({ ...base, now });
    expect(preview.allowed).toBe(false);
    expect(preview.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("privacy and configuration", () => {
  it("never stores the raw subject key", async () => {
    await consume({ ...base, now: new Date("2026-08-15T12:00:10.000Z") });

    const storedKeys = [...store.keys()].join("|");
    expect(storedKeys).not.toContain("ada@example.org");
    expect(storedKeys).toContain("test.scope");
  });

  it("always allows while RATE_LIMIT_ENABLED is false", async () => {
    vi.stubEnv("RATE_LIMIT_ENABLED", "false");
    resetEnvCacheForTests();

    const now = new Date("2026-08-15T12:00:10.000Z");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = await consume({ ...base, now });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(base.limit);
    }

    expect(store.size).toBe(0);
  });
});

describe("policies", () => {
  it("uses the policy scope, limit and window", async () => {
    const now = new Date("2026-08-15T12:00:10.000Z");

    expect(magicLinkPerEmail.limit).toBe(3);
    expect(magicLinkPerEmail.windowSeconds).toBe(900);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const allowed = await consumePolicy(magicLinkPerEmail, "ada@example.org", { now });
      expect(allowed.allowed).toBe(true);
    }

    const blocked = await consumePolicy(magicLinkPerEmail, "ada@example.org", { now });
    expect(blocked.allowed).toBe(false);
    expect(blocked.limit).toBe(3);
  });
});
