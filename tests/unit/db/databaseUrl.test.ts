import { describe, expect, it } from "vitest";

import { ConfigurationError } from "@/lib/core/errors";
import { parseDatabaseConnectionSettings } from "@/lib/db/createPrismaClient";

const BASE = "postgresql://brokermogger:secret-value@localhost:5432/brokermogger";

function withParams(parameters: string): string {
  return `${BASE}?${parameters}`;
}

describe("parseDatabaseConnectionSettings", () => {
  it("uses the Prisma 6 defaults when no pool settings are present", () => {
    expect(parseDatabaseConnectionSettings(BASE)).toEqual({
      poolMax: 10,
      connectionTimeoutMillis: 5_000,
    });
  });

  it("preserves a plain schema identifier", () => {
    expect(parseDatabaseConnectionSettings(withParams("schema=tenant_42"))).toEqual({
      schema: "tenant_42",
      poolMax: 10,
      connectionTimeoutMillis: 5_000,
    });
  });

  it("preserves connection_limit, connect_timeout and pool_timeout", () => {
    expect(
      parseDatabaseConnectionSettings(
        withParams("schema=public&connection_limit=25&connect_timeout=3&pool_timeout=7")
      )
    ).toEqual({
      schema: "public",
      poolMax: 25,
      connectionTimeoutMillis: 7_000,
    });

    expect(
      parseDatabaseConnectionSettings(withParams("connect_timeout=3"))
    ).toMatchObject({
      poolMax: 10,
      connectionTimeoutMillis: 3_000,
    });
  });

  it.each([
    "schema=tenant-blue",
    "schema=tenant.one",
    "schema=Tenant",
    "schema=%22tenant%22",
    "schema=tenant%20one",
  ])("rejects an unrepresentable explicit schema (%s)", (parameter) => {
    let error: unknown;
    try {
      parseDatabaseConnectionSettings(withParams(parameter));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigurationError);
    expect((error as Error).message).toMatch(/plain lowercase PostgreSQL identifier/);
    expect((error as Error).message).not.toContain("secret-value");
  });

  it.each([
    "connection_limit=0",
    "connection_limit=abc",
    "connect_timeout=-1",
    "pool_timeout=1.5",
  ])("rejects an invalid numeric setting (%s)", (parameter) => {
    expect(() => parseDatabaseConnectionSettings(withParams(parameter))).toThrow(
      ConfigurationError
    );
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
