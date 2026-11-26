/**
 * The single Prisma client instance.
 *
 * Only `lib/db/**`, the worker, seeds and tests may import this module. All
 * application code goes through the repositories in `lib/db/repositories`
 * which require an ActorContext and apply ownership scoping.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";

import { env } from "@/lib/config/env";

/**
 * Prisma 7's pg driver adapter no longer honours `?schema=` on its own: schema
 * selection must be passed explicitly, and raw queries need it on the connection
 * `search_path` too. Preserve Prisma 6's `DATABASE_URL ?schema=` semantics.
 */
function prismaPgAdapter(connectionString: string) {
  let schema: string | undefined;
  try {
    const raw = new URL(connectionString).searchParams.get("schema");
    // Only allow a plain identifier; never interpolate anything else into SQL.
    schema = raw && /^[A-Za-z_][A-Za-z0-9_]*$/.test(raw) ? raw : undefined;
  } catch {
    schema = undefined;
  }
  return new PrismaPg(
    schema
      ? { connectionString, options: `-c search_path="${schema}"` }
      : { connectionString },
    schema ? { schema } : undefined
  );
}

const globalForPrisma = globalThis as unknown as { brokermoggerPrisma?: PrismaClient };

function createClient(): PrismaClient {
  // Prisma 7 requires an explicit driver adapter; the connection string comes
  // from the validated environment instead of Prisma's own env resolution.
  const adapter = prismaPgAdapter(env.DATABASE_URL);
  return new PrismaClient({
    adapter,
    // Prisma's formatted errors include query arguments, which may be personal.
    // Callers log stable error codes through createLogger instead.
    log: [],
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
