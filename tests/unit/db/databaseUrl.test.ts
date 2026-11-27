import { availableParallelism } from "node:os";
import { describe, expect, it } from "vitest";

import { ConfigurationError } from "@/lib/core/errors";
import { parseDatabaseConnectionSettings } from "@/lib/db/createPrismaClient";

const BASE = "postgresql://brokermogger:secret-value@localhost:5432/brokermogger";
const DEFAULT_POOL_MAX = Math.max(1, availableParallelism() * 2 + 1);

function withParams(parameters: string): string {
  return `${BASE}?${parameters}`;
}

describe("parseDatabaseConnectionSettings", () => {
  it("defaults to the Prisma 6 public schema, CPU-derived pool and 10s pool timeout", () => {
    expect(parseDatabaseConnectionSettings(BASE)).toEqual({
      schema: "public",
      poolMax: DEFAULT_POOL_MAX,
      connectionTimeoutMillis: 10_000,
      options: '-c search_path="public"',
      connectionString: BASE,
    });
  });

  it("preserves a plain schema identifier for both adapter and raw SQL", () => {
    expect(parseDatabaseConnectionSettings(withParams("schema=tenant_42"))).toMatchObject(
      {
        schema: "tenant_42",
        options: '-c search_path="tenant_42"',
        connectionString: BASE,
      }
    );
  });

  it("preserves connection_limit, connect_timeout and pool_timeout precedence", () => {
    expect(
      parseDatabaseConnectionSettings(
        withParams("schema=public&connection_limit=25&connect_timeout=3&pool_timeout=7")
      )
    ).toMatchObject({
      schema: "public",
      poolMax: 25,
      connectionTimeoutMillis: 7_000,
    });

    expect(
      parseDatabaseConnectionSettings(withParams("connect_timeout=3"))
    ).toMatchObject({
      poolMax: DEFAULT_POOL_MAX,
      connectionTimeoutMillis: 3_000,
    });
  });

  it("removes schema and options from the pg connection string so they cannot override config", () => {
    const settings = parseDatabaseConnectionSettings(
      withParams("schema=tenant_a&options=-c%20statement_timeout%3D5000&sslmode=disable")
    );
    const parsed = new URL(settings.connectionString);
    expect(parsed.searchParams.has("schema")).toBe(false);
    expect(parsed.searchParams.has("options")).toBe(false);
    expect(parsed.searchParams.get("sslmode")).toBe("disable");
    expect(settings.options).toBe('-c statement_timeout=5000 -c search_path="tenant_a"');
  });

  it.each([
    "schema=tenant-blue",
    "schema=tenant.one",
    "schema=Tenant",
    "schema=%22tenant%22",
    "schema=tenant%20one",
    "schema=",
    "schema=one&schema=two",
  ])("rejects an unrepresentable or ambiguous schema (%s)", (parameter) => {
    let error: unknown;
    try {
      parseDatabaseConnectionSettings(withParams(parameter));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).toMatch(/schema/i);
    expect((error as Error).message).not.toContain("secret-value");
  });

  it.each([
    "options=-c%20search_path%3Dtenant_b",
    "options=-c%20Search_Path%20%3D%20tenant_b",
    "options=-c%20statement_timeout%3D5000&options=-c%20search_path%3Dtenant_b",
  ])("rejects an options value that could override the search path (%s)", (parameter) => {
    expect(() => parseDatabaseConnectionSettings(withParams(parameter))).toThrow(
      ConfigurationError
    );
  });

  it.each([
    "connection_limit=0",
    "connection_limit=abc",
    "connect_timeout=-1",
    "pool_timeout=1.5",
    // A secret-like malformed value must never be echoed back in the error.
    "connection_limit=ghp_thisLooksLikeAToken1234567890",
  ])("rejects an invalid numeric setting without echoing it (%s)", (parameter) => {
    let error: unknown;
    try {
      parseDatabaseConnectionSettings(withParams(parameter));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).not.toContain("ghp_");
    expect((error as Error).message).not.toContain("thisLooksLikeAToken");
  });

  it("requires an explicit sslmode for remote hosts when production enforcement is on", () => {
    const remote =
      "postgresql://brokermogger:secret-value@db.example.org:5432/brokermogger";
    expect(() =>
      parseDatabaseConnectionSettings(remote, { requireExplicitSsl: true })
    ).toThrow(ConfigurationError);

    for (const sslmode of ["verify-full", "verify-ca", "require", "disable"]) {
      expect(
        parseDatabaseConnectionSettings(`${remote}?sslmode=${sslmode}`, {
          requireExplicitSsl: true,
        }).schema
      ).toBe("public");
    }

    expect(
      parseDatabaseConnectionSettings(BASE, { requireExplicitSsl: true }).schema
    ).toBe("public");
  });

  it("rejects malformed or non-postgres connection strings without echoing them", () => {
    for (const value of ["not a url", "mysql://user:secret-value@localhost/db"]) {
      let error: unknown;
      try {
        parseDatabaseConnectionSettings(value);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as Error).message).not.toContain("secret-value");
    }
  });
});
