import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/createPrismaClient";
import { testPrisma } from "../../helpers/db";

function withSchema(connectionString: string, schema: string): string {
  const url = new URL(connectionString);
  url.searchParams.set("schema", schema);
  return url.toString();
}

/**
 * Prisma 7's pg adapter dropped automatic `?schema=` handling. The shared
 * factory applies it to both generated SQL (adapter option) and raw queries
 * (connection `search_path`); this test proves both paths with two identical
 * tables and proves a schema is never silently replaced by `public`.
 */
describe("database schema selection", () => {
  it("routes generated SQL and raw queries to the requested schema", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const schemaA = `bm_schema_a_${suffix}`;
    const schemaB = `bm_schema_b_${suffix}`;
    const email = `schema-${suffix}@example.invalid`;
    await testPrisma.$executeRawUnsafe(`CREATE SCHEMA "${schemaA}"`);
    await testPrisma.$executeRawUnsafe(`CREATE SCHEMA "${schemaB}"`);

    let clientA: ReturnType<typeof createPrismaClient> | undefined;
    let clientB: ReturnType<typeof createPrismaClient> | undefined;
    try {
      for (const schema of [schemaA, schemaB])
        await testPrisma.$executeRawUnsafe(
          `CREATE TABLE "${schema}"."User" AS TABLE public."User" WITH NO DATA`
        );

      const user = await testPrisma.user.create({ data: { email } });
      // Only schema B contains a row. Compare with count() because the copied
      // table intentionally has no constraints or indexes.
      await testPrisma.$executeRawUnsafe(
        `INSERT INTO "${schemaB}"."User" SELECT * FROM public."User" WHERE id = $1`,
        user.id
      );

      const url = process.env.TEST_DATABASE_URL!;
      clientA = createPrismaClient({ connectionString: withSchema(url, schemaA) });
      clientB = createPrismaClient({ connectionString: withSchema(url, schemaB) });

      expect(await clientA.user.count()).toBe(0);
      expect(await clientB.user.count()).toBe(1);
      expect(
        await clientA.$queryRawUnsafe<{ count: number }[]>(
          `SELECT count(*)::int AS count FROM "User"`
        )
      ).toEqual([{ count: 0 }]);
      expect(
        await clientB.$queryRawUnsafe<{ count: number }[]>(
          `SELECT count(*)::int AS count FROM "User"`
        )
      ).toEqual([{ count: 1 }]);
    } finally {
      await clientA?.$disconnect();
      await clientB?.$disconnect();
      await testPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaA}" CASCADE`);
      await testPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaB}" CASCADE`);
      await testPrisma.user.deleteMany({ where: { email } });
    }
  });
});
