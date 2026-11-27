import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createPrismaClient } from "@/lib/db/createPrismaClient";
import { testPrisma } from "../../helpers/db";

function withSchema(connectionString: string, schema?: string): string {
  const url = new URL(connectionString);
  if (schema) url.searchParams.set("schema", schema);
  return url.toString();
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function currentDatabase(): Promise<string> {
  const [row] = await testPrisma.$queryRaw<
    { name: string }[]
  >`SELECT current_database() AS name`;
  return row!.name;
}

/**
 * Prisma 7's pg adapter dropped automatic `?schema=` handling. The shared
 * factory applies it to both generated SQL (adapter option) and raw queries
 * (connection `search_path`); these tests prove the two paths cannot diverge,
 * including database defaults and benign URL `options`.
 */
describe("database schema selection", () => {
  it("routes generated SQL and raw queries to the requested schema", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const schemaA = `bm_schema_a_${suffix}`;
    const schemaB = `bm_schema_b_${suffix}`;
    const email = `schema-${suffix}@example.invalid`;
    await testPrisma.$executeRawUnsafe(`CREATE SCHEMA ${quoteIdentifier(schemaA)}`);
    await testPrisma.$executeRawUnsafe(`CREATE SCHEMA ${quoteIdentifier(schemaB)}`);

    let clientA: ReturnType<typeof createPrismaClient> | undefined;
    let clientB: ReturnType<typeof createPrismaClient> | undefined;
    try {
      for (const schema of [schemaA, schemaB])
        await testPrisma.$executeRawUnsafe(
          `CREATE TABLE ${quoteIdentifier(schema)}."User" AS TABLE public."User" WITH NO DATA`
        );

      const user = await testPrisma.user.create({ data: { email } });
      // Only schema B contains a row. Compare with count() because the copied
      // table intentionally has no constraints or indexes.
      await testPrisma.$executeRawUnsafe(
        `INSERT INTO ${quoteIdentifier(schemaB)}."User" SELECT * FROM public."User" WHERE id = $1`,
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
      await testPrisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaA)} CASCADE`
      );
      await testPrisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaB)} CASCADE`
      );
      await testPrisma.user.deleteMany({ where: { email } });
    }
  });

  it("keeps raw SQL in the selected schema when the database default and URL options disagree", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const schemaA = `bm_schema_a_${suffix}`;
    const schemaB = `bm_schema_b_${suffix}`;
    const email = `schema-default-${suffix}@example.invalid`;
    const database = await currentDatabase();
    await testPrisma.$executeRawUnsafe(`CREATE SCHEMA ${quoteIdentifier(schemaA)}`);
    await testPrisma.$executeRawUnsafe(`CREATE SCHEMA ${quoteIdentifier(schemaB)}`);

    let client: ReturnType<typeof createPrismaClient> | undefined;
    try {
      for (const schema of [schemaA, schemaB])
        await testPrisma.$executeRawUnsafe(
          `CREATE TABLE ${quoteIdentifier(schema)}."User" AS TABLE public."User" WITH NO DATA`
        );
      const user = await testPrisma.user.create({ data: { email } });
      await testPrisma.$executeRawUnsafe(
        `INSERT INTO ${quoteIdentifier(schemaB)}."User" SELECT * FROM public."User" WHERE id = $1`,
        user.id
      );
      // New connections would default to schema B without an explicit
      // search_path. Benign URL options must not displace the schema either.
      await testPrisma.$executeRawUnsafe(
        `ALTER DATABASE ${quoteIdentifier(database)} SET search_path = ${quoteIdentifier(schemaB)}, public`
      );

      const url = new URL(process.env.TEST_DATABASE_URL!);
      url.searchParams.set("schema", schemaA);
      url.searchParams.set("options", "-c statement_timeout=5000");
      client = createPrismaClient({ connectionString: url.toString() });

      expect(await client.user.count()).toBe(0);
      expect(
        await client.$queryRawUnsafe<{ count: number }[]>(
          `SELECT count(*)::int AS count FROM "User"`
        )
      ).toEqual([{ count: 0 }]);
      expect(
        await client.$queryRawUnsafe<{ schema: string }[]>(
          `SELECT current_schema() AS schema`
        )
      ).toEqual([{ schema: schemaA }]);
      expect(
        await client.$queryRawUnsafe<{ statement_timeout: string }[]>(
          `SHOW statement_timeout`
        )
      ).toEqual([{ statement_timeout: "5s" }]);
    } finally {
      await client?.$disconnect();
      await testPrisma.$executeRawUnsafe(
        `ALTER DATABASE ${quoteIdentifier(database)} RESET search_path`
      );
      await testPrisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaA)} CASCADE`
      );
      await testPrisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaB)} CASCADE`
      );
      await testPrisma.user.deleteMany({ where: { email } });
    }
  });

  it("normalizes a missing schema to public instead of a role or database default", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const otherSchema = `bm_schema_other_${suffix}`;
    const database = await currentDatabase();
    await testPrisma.$executeRawUnsafe(`CREATE SCHEMA ${quoteIdentifier(otherSchema)}`);
    let client: ReturnType<typeof createPrismaClient> | undefined;
    try {
      await testPrisma.$executeRawUnsafe(
        `CREATE TABLE ${quoteIdentifier(otherSchema)}."User" AS TABLE public."User" WITH NO DATA`
      );
      await testPrisma.$executeRawUnsafe(
        `ALTER DATABASE ${quoteIdentifier(database)} SET search_path = ${quoteIdentifier(otherSchema)}, public`
      );
      client = createPrismaClient({ connectionString: process.env.TEST_DATABASE_URL! });
      expect(
        await client.$queryRawUnsafe<{ schema: string }[]>(
          `SELECT current_schema() AS schema`
        )
      ).toEqual([{ schema: "public" }]);
    } finally {
      await client?.$disconnect();
      await testPrisma.$executeRawUnsafe(
        `ALTER DATABASE ${quoteIdentifier(database)} RESET search_path`
      );
      await testPrisma.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS ${quoteIdentifier(otherSchema)} CASCADE`
      );
    }
  });
});
