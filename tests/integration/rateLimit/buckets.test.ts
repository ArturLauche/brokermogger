/**
 * Rate limiting against a real PostgreSQL instance.
 *
 * The point of these tests is the statement itself: the counter must be exact
 * under concurrency, because two parallel magic link requests must not both
 * read "0 used" and both be allowed.
 */
import { describe, expect, it } from "vitest";

import {
  check,
  consume,
  magicLinkPerEmail,
  purgeExpiredBuckets,
  windowStartFor,
} from "@/lib/rateLimit";

import { testPrisma } from "../../helpers/db";
import { incrementBucket, incrementBuckets } from "@/lib/db/repositories/rateLimit";

const WINDOW_SECONDS = 60;

function request(overrides: Record<string, unknown> = {}) {
  return {
    scope: "test.integration",
    key: "ada@example.org",
    limit: 5,
    windowSeconds: WINDOW_SECONDS,
    ...overrides,
  };
}

describe("bucket storage", () => {
  it("creates one row per scope, key and window", async () => {
    const now = new Date("2026-08-15T12:00:10.000Z");

    await consume(request({ now }));
    await consume(request({ now }));
    await consume(request({ key: "grace@example.org", now }));

    const rows = await testPrisma.rateLimitBucket.findMany({
      where: { scope: "test.integration" },
      orderBy: { count: "desc" },
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]?.count).toBe(2);
    expect(rows[1]?.count).toBe(1);
    expect(rows[0]?.windowStart.toISOString()).toBe("2026-08-15T12:00:00.000Z");
  });

  it("stores a hashed key, never the raw address", async () => {
    await consume(request({ now: new Date("2026-08-15T12:00:10.000Z") }));

    const row = await testPrisma.rateLimitBucket.findFirstOrThrow({
      where: { scope: "test.integration" },
    });

    expect(row.key).not.toContain("ada@example.org");
    expect(row.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("is atomic under concurrency", async () => {
    const now = new Date("2026-08-15T12:00:10.000Z");

    const results = await Promise.all(
      Array.from({ length: 20 }, () => consume(request({ now })))
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed)).toHaveLength(15);

    const row = await testPrisma.rateLimitBucket.findFirstOrThrow({
      where: { scope: "test.integration" },
    });
    expect(row.count).toBe(20);

    // Every allowed result must have reported a distinct remaining budget.
    const remaining = results
      .filter((result) => result.allowed)
      .map((result) => result.remaining)
      .sort((left, right) => left - right);
    expect(remaining).toEqual([0, 1, 2, 3, 4]);
  });

  it("opens a fresh budget in the next window", async () => {
    const first = new Date("2026-08-15T12:00:10.000Z");
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await consume(request({ now: first }));
    }

    const blocked = await check(request({ now: first }));
    expect(blocked.allowed).toBe(false);

    const second = new Date("2026-08-15T12:01:05.000Z");
    const allowed = await consume(request({ now: second }));
    expect(allowed.allowed).toBe(true);

    const rows = await testPrisma.rateLimitBucket.findMany({
      where: { scope: "test.integration" },
    });
    expect(rows).toHaveLength(2);
  });

  it("reports the real remaining budget through check", async () => {
    const now = new Date("2026-08-15T12:00:10.000Z");
    await consume(request({ now }));
    await consume(request({ now }));

    const preview = await check(request({ now }));
    expect(preview.remaining).toBe(3);

    const rowCount = await testPrisma.rateLimitBucket.count({
      where: { scope: "test.integration" },
    });
    expect(rowCount).toBe(1);
  });
});

describe("policies and cleanup", () => {
  it("applies the magic link per email policy end to end", async () => {
    const now = new Date("2026-08-15T12:00:10.000Z");
    const windowStart = windowStartFor(now, magicLinkPerEmail.windowSeconds);

    for (let attempt = 0; attempt < magicLinkPerEmail.limit; attempt += 1) {
      const result = await consume({
        scope: magicLinkPerEmail.scope,
        key: "ada@example.org",
        limit: magicLinkPerEmail.limit,
        windowSeconds: magicLinkPerEmail.windowSeconds,
        now,
      });
      expect(result.allowed).toBe(true);
    }

    const blocked = await consume({
      scope: magicLinkPerEmail.scope,
      key: "ada@example.org",
      limit: magicLinkPerEmail.limit,
      windowSeconds: magicLinkPerEmail.windowSeconds,
      now,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    const row = await testPrisma.rateLimitBucket.findFirstOrThrow({
      where: { scope: magicLinkPerEmail.scope },
    });
    expect(row.windowStart.toISOString()).toBe(windowStart.toISOString());
  });

  it("purges only windows that already expired", async () => {
    await consume(request({ now: new Date("2026-08-15T12:00:10.000Z") }));
    await consume(request({ now: new Date("2026-08-15T14:00:10.000Z") }));

    const removed = await purgeExpiredBuckets(new Date("2026-08-15T13:00:00.000Z"));
    expect(removed).toBe(1);

    const rows = await testPrisma.rateLimitBucket.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.windowStart.toISOString()).toBe("2026-08-15T14:00:00.000Z");
  });
});

it("rolls back all authentication counters if a later bucket write fails", async () => {
  const { incrementBuckets } = await import("@/lib/db/repositories/rateLimit");
  const identity = {
    scope: "test.atomic.auth",
    key: "synthetic-hash",
    windowStart: new Date(),
    windowSeconds: 60,
  };
  await expect(
    incrementBuckets([identity, { ...identity, key: null as unknown as string }])
  ).rejects.toThrow();
  expect(
    await testPrisma.rateLimitBucket.count({ where: { scope: identity.scope } })
  ).toBe(0);
});

it("fails closed and rolls back both counters when a database trigger suppresses a write", async () => {
  const { incrementBuckets } = await import("@/lib/db/repositories/rateLimit");
  await testPrisma.$executeRawUnsafe(
    `CREATE FUNCTION synthetic_skip_bucket() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.scope = 'test.skip.bucket' THEN RETURN NULL; END IF; RETURN NEW; END $$`
  );
  await testPrisma.$executeRawUnsafe(
    `CREATE TRIGGER synthetic_skip_bucket BEFORE INSERT ON "RateLimitBucket" FOR EACH ROW EXECUTE FUNCTION synthetic_skip_bucket()`
  );
  try {
    const identity = {
      scope: "test.batch.first",
      key: "synthetic-key",
      windowStart: new Date(),
      windowSeconds: 60,
    };
    await expect(
      incrementBuckets([identity, { ...identity, scope: "test.skip.bucket" }])
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(await testPrisma.rateLimitBucket.count()).toBe(0);
  } finally {
    await testPrisma.$executeRawUnsafe(
      `DROP TRIGGER synthetic_skip_bucket ON "RateLimitBucket"`
    );
    await testPrisma.$executeRawUnsafe(`DROP FUNCTION synthetic_skip_bucket()`);
  }
});

it.each(["single", "batch"] as const)(
  "bounds standalone %s counter contention and recovers after rollback",
  async (mode) => {
    const identity = {
      scope: "test.bounded.counter",
      key: "synthetic-hash",
      windowStart: new Date("2026-10-13T12:00:00Z"),
      windowSeconds: 60,
    };
    await incrementBucket(identity);
    let acquired!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = testPrisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "RateLimitBucket" WHERE "scope" = ${identity.scope} FOR UPDATE`;
        acquired();
        await released;
      },
      { maxWait: 2_000, timeout: 10_000 }
    );
    const cleanup = setTimeout(release, 7_000);
    try {
      await Promise.race([ready, blocker]);
      const started = performance.now();
      const operation =
        mode === "single"
          ? incrementBucket(identity)
          : incrementBuckets([
              { ...identity, key: "first-write-must-roll-back" },
              identity,
            ]);
      await expect(operation).rejects.toThrow();
      expect(performance.now() - started).toBeLessThan(4_500);
      const rows = await testPrisma.rateLimitBucket.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.count).toBe(1);
    } finally {
      clearTimeout(cleanup);
      release();
      await blocker;
    }
    expect(await incrementBucket(identity)).toBe(2);
  }
);
