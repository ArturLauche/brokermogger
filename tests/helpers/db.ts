import { type PrismaClient } from "@prisma/client";

import { TEST_DATABASE_URL } from "../setup/test-env";
import { createPrismaClient } from "@/lib/db/createPrismaClient";

/**
 * Prisma client for integration tests. Always bound to TEST_DATABASE_URL by
 * `tests/setup/test-env.ts`, through the same adapter factory the app uses so
 * `?schema=`, pool size and connection timeouts behave identically.
 */
export const testPrisma: PrismaClient = createPrismaClient({
  connectionString: TEST_DATABASE_URL,
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
