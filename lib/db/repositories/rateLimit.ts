/**
 * Persistence for PostgreSQL backed fixed window rate limit counters.
 *
 * The increment must be atomic across concurrent requests, so it is a single
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count` statement instead of a
 * read-modify-write. Keys arrive pre-hashed from `lib/rateLimit`: this table
 * never stores a raw email address, IP address or domain.
 */
import { randomUUID } from "node:crypto";

import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { AppError } from "@/lib/core/errors";

export interface BucketIdentity {
  scope: string;
  /** Already hashed by the caller. */
  key: string;
  windowStart: Date;
  windowSeconds: number;
}

type Queryable = Pick<PrismaTransaction, "$queryRaw">;

export interface BucketReservation {
  reserved: boolean;
  count: number;
}

export interface RequestCreateQuotaReservation {
  reserved: boolean;
  rejectedBucket: "daily" | "monthly" | null;
  rollingCount: number;
}

class MonthlyQuotaRollback extends AppError {
  readonly bucket = "monthly" as const;

  constructor() {
    super({
      code: "QUOTA_EXCEEDED",
      message: "This batch would exceed the monthly operational request limit.",
      details: { bucket: "monthly" },
    });
    this.name = "MonthlyQuotaRollback";
  }
}

/** Atomically increments the counter for one window and returns the new value. */
export async function incrementBucket(identity: BucketIdentity): Promise<number> {
  return incrementBucketOn(prisma, identity);
}

/** Both authentication counters commit together or neither does. */
export async function incrementBuckets(identities: readonly BucketIdentity[]) {
  return prisma.$transaction(async (tx) => {
    const counts: number[] = [];
    for (const identity of identities) counts.push(await incrementBucketOn(tx, identity));
    return counts;
  });
}

async function incrementBucketOn(
  db: Queryable,
  identity: BucketIdentity
): Promise<number> {
  const expiresAt = new Date(
    identity.windowStart.getTime() + identity.windowSeconds * 1000
  );

  const rows = await db.$queryRaw<{ count: number }[]>`
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

  if (!rows[0])
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "The rate limit counter could not be recorded.",
    });
  return rows[0].count;
}

/**
 * Atomically adds `weight` only when `max(storedCount, baseline) + weight`
 * still fits in `limit`. A rejection does not increment the counter.
 *
 * `baseline` is the number of already persisted rows that this quota should
 * cover (for example requests created in the rolling window). That closes the
 * gap where the bucket starts at 0 while the account already has many rows.
 */
export async function reserveBucket(
  identity: BucketIdentity,
  weight: number,
  limit: number,
  baseline = 0
): Promise<BucketReservation> {
  return reserveBucketOn(prisma, identity, weight, limit, baseline);
}

async function reserveBucketOn(
  db: Queryable,
  identity: BucketIdentity,
  weight: number,
  limit: number,
  baseline: number
): Promise<BucketReservation> {
  if (!Number.isInteger(weight) || weight < 1) {
    throw new Error("reserveBucket weight must be a positive integer");
  }

  const floor = Math.max(baseline, 0);
  const proposed = floor + weight;
  if (proposed > limit) {
    return { reserved: false, count: floor };
  }

  const expiresAt = new Date(
    identity.windowStart.getTime() + identity.windowSeconds * 1000
  );

  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" (
      "id", "scope", "key", "windowStart", "windowSeconds", "count", "expiresAt",
      "createdAt", "updatedAt"
    )
    VALUES (
      ${randomUUID()}, ${identity.scope}, ${identity.key},
      ${identity.windowStart}, ${identity.windowSeconds}, ${proposed}, ${expiresAt},
      now(), now()
    )
    ON CONFLICT ("scope", "key", "windowStart")
    DO UPDATE SET
      "count" = GREATEST("RateLimitBucket"."count", ${floor}) + ${weight},
      "updatedAt" = now()
    WHERE GREATEST("RateLimitBucket"."count", ${floor}) + ${weight} <= ${limit}
    RETURNING "count"
  `;

  if (rows[0]) {
    return { reserved: true, count: rows[0].count };
  }

  return { reserved: false, count: floor };
}

/**
 * Reserves `requestedCount` against the daily and monthly request-create
 * buckets in one transaction. The per-user advisory lock plus a GREATEST
 * against the live request count make concurrent generate calls share one
 * budget instead of each consuming a single workflow increment.
 * With a caller-owned transaction, monthly rejection throws QUOTA_EXCEEDED;
 * the caller must propagate it to roll back the earlier daily reservation.
 */
export async function reserveWeightedRequestCreate(
  input: {
    userId: string;
    requestedCount: number;
    daily: BucketIdentity & { limit: number };
    monthly: BucketIdentity & { limit: number };
    rollingSince: Date;
  },
  transaction?: PrismaTransaction
): Promise<RequestCreateQuotaReservation> {
  try {
    const reserve = async (
      tx: PrismaTransaction
    ): Promise<RequestCreateQuotaReservation> => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        `brokermogger_request_create_${input.userId}`
      );

      const rollingCount = await tx.removalRequest.count({
        where: {
          userId: input.userId,
          createdAt: { gte: input.rollingSince },
          deletedAt: null,
        },
      });
      const dailyBaseline = await tx.removalRequest.count({
        where: {
          userId: input.userId,
          createdAt: { gte: input.daily.windowStart },
          deletedAt: null,
        },
      });

      const daily = await reserveBucketOn(
        tx,
        input.daily,
        input.requestedCount,
        input.daily.limit,
        dailyBaseline
      );
      if (!daily.reserved) {
        return {
          reserved: false,
          rejectedBucket: "daily" as const,
          rollingCount,
        };
      }

      const monthly = await reserveBucketOn(
        tx,
        input.monthly,
        input.requestedCount,
        input.monthly.limit,
        rollingCount
      );
      if (!monthly.reserved) {
        throw new MonthlyQuotaRollback();
      }

      return { reserved: true, rejectedBucket: null, rollingCount };
    };
    return await (transaction ? reserve(transaction) : prisma.$transaction(reserve));
  } catch (error) {
    if (error instanceof MonthlyQuotaRollback) {
      if (transaction) throw error;
      const rollingCount = await prisma.removalRequest.count({
        where: {
          userId: input.userId,
          createdAt: { gte: input.rollingSince },
          deletedAt: null,
        },
      });
      return { reserved: false, rejectedBucket: "monthly", rollingCount };
    }
    throw error;
  }
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

export async function countExpiredBuckets(now = new Date()): Promise<number> {
  return prisma.rateLimitBucket.count({
    where: { expiresAt: { lt: now } },
  });
}
