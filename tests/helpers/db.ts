import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { TEST_DATABASE_URL } from "../setup/test-env";

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

/**
 * Prisma client for integration tests. Always bound to TEST_DATABASE_URL by
 * `tests/setup/test-env.ts`.
 */
export const testPrisma = new PrismaClient({
  // Prisma 7 requires an explicit driver adapter.
  adapter: prismaPgAdapter(TEST_DATABASE_URL),
  log: process.env.TEST_LOG_QUERIES === "true" ? ["query", "warn", "error"] : ["error"],
});

const PROTECTED_TABLES = [
  "AuditLog",
  "RemovalRequestEvent",
  "RequestSnapshot",
  "ConsentRecord",
];

/**
 * Truncates every application table. Append-only tables are protected by
 * database triggers, so the retention escape hatch is opened for the
 * truncating transaction only.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await testPrisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;

  if (tables.length === 0) {
    return;
  }

  const quoted = tables.map((table) => `"public"."${table.tablename}"`).join(", ");

  await testPrisma.$transaction([
    testPrisma.$executeRawUnsafe(
      `SELECT set_config('brokermogger.allow_append_only_delete', 'on', true)`
    ),
    testPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`),
  ]);
}

export { PROTECTED_TABLES };
