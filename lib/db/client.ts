/**
 * The single Prisma client instance.
 *
 * Only `lib/db/**`, the worker, seeds and tests may import this module. All
 * application code goes through the repositories in `lib/db/repositories`
 * which require an ActorContext and apply ownership scoping.
 */
import { PrismaClient, type Prisma } from "@prisma/client";

import { env } from "@/lib/config/env";

const globalForPrisma = globalThis as unknown as { brokermoggerPrisma?: PrismaClient };

function createClient(): PrismaClient {
  return new PrismaClient({
    log: env.LOG_LEVEL === "debug" ? ["warn", "error"] : ["error"],
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
