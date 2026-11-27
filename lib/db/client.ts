/**
 * The single Prisma client instance.
 *
 * Only `lib/db/**`, the worker, seeds and tests may import this module. All
 * application code goes through the repositories in `lib/db/repositories`
 * which require an ActorContext and apply ownership scoping.
 */
import { type PrismaClient, type Prisma } from "@prisma/client";

import { env } from "@/lib/config/env";
import { createPrismaClient } from "@/lib/db/createPrismaClient";

const globalForPrisma = globalThis as unknown as { brokermoggerPrisma?: PrismaClient };

function createClient(): PrismaClient {
  // Prisma 7 requires an explicit driver adapter; the connection string comes
  // from the validated environment instead of Prisma's own env resolution.
  return createPrismaClient({
    connectionString: env.DATABASE_URL,
    // Prisma 6 defaulted to sslmode=prefer; pg defaults to plaintext. Require
    // an explicit decision for remote production databases instead of silently
    // downgrading an existing TLS connection.
    requireExplicitSsl: env.isProduction,
  });
}

export const prisma: PrismaClient = globalForPrisma.brokermoggerPrisma ?? createClient();

if (!env.isProduction) {
  globalForPrisma.brokermoggerPrisma = prisma;
}

export type PrismaTransaction = Prisma.TransactionClient;

/**
 * Opens the retention escape hatch for one transaction so that the append-only
 * guard triggers permit DELETE. Only the retention sweep and the account
 * deletion job may use this, and both write an audit entry first.
 */
export async function withAppendOnlyDeletes<T>(
  handler: (tx: PrismaTransaction) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT set_config('brokermogger.allow_append_only_delete', 'on', true)"
    );
    return handler(tx);
  });
}
