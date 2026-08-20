/**
 * Persistence for PostgreSQL backed fixed window rate limit counters.
 *
 * The increment must be atomic across concurrent requests, so it is a single
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count` statement instead of a
 * read-modify-write. Keys arrive pre-hashed from `lib/rateLimit`: this table
 * never stores a raw email address, IP address or domain.
 */
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/client";

export interface BucketIdentity {
  scope: string;
  /** Already hashed by the caller. */
  key: string;
  windowStart: Date;
  windowSeconds: number;
}

/** Atomically increments the counter for one window and returns the new value. */
export async function incrementBucket(identity: BucketIdentity): Promise<number> {
  const expiresAt = new Date(
    identity.windowStart.getTime() + identity.windowSeconds * 1000
  );

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" (
      "id", "scope", "key", "windowStart", "windowSeconds", "count", "expiresAt",
      "createdAt", "updatedAt"
    )
    VALUES (
      ${randomUUID()}, ${identity.scope}, ${identity.key},
      ${identity.windowStart}, ${identity.windowSeconds}, 1, ${expiresAt},
      now(), now()
    )
    ON CONFLICT ("scope", "key", "windowStart")
    DO UPDATE SET "count" = "RateLimitBucket"."count" + 1, "updatedAt" = now()
    RETURNING "count"
  `;

  return rows[0]?.count ?? 1;
}

/** Reads the current counter without incrementing it. */
export async function readBucketCount(identity: {
  scope: string;
  key: string;
  windowStart: Date;
}): Promise<number> {
  const bucket = await prisma.rateLimitBucket.findUnique({
    where: {
      scope_key_windowStart: {
        scope: identity.scope,
        key: identity.key,
        windowStart: identity.windowStart,
      },
    },
    select: { count: true },
  });

  return bucket?.count ?? 0;
}

/** Removes windows that can no longer influence a decision. */
export async function deleteExpiredBuckets(now = new Date()): Promise<number> {
  const result = await prisma.rateLimitBucket.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return result.count;
}
