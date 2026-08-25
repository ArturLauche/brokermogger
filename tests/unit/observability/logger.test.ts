import { describe, expect, it } from "vitest";

import { safeMeta, shouldUsePrettyTransport } from "@/lib/observability/logger";

describe("shouldUsePrettyTransport", () => {
  it("is only for local development Node processes", () => {
    expect(
      shouldUsePrettyTransport({ APP_ENV: "development", NODE_ENV: "development" })
    ).toBe(true);
    expect(
      shouldUsePrettyTransport({ APP_ENV: "development", NODE_ENV: "production" })
    ).toBe(false);
    expect(shouldUsePrettyTransport({ APP_ENV: "development", NODE_ENV: "test" })).toBe(
      false
    );
    expect(
      shouldUsePrettyTransport({ APP_ENV: "production", NODE_ENV: "production" })
    ).toBe(false);
  });
});

describe("safeMeta", () => {
  it("keeps allow-listed primitives and drops everything else", () => {
    expect(
      safeMeta(
        {
          requestId: "req-1",
          attempt: 2,
          ok: true,
          email: "ada@example.org",
          nested: { token: "secret" },
        },
        ["requestId", "attempt", "ok"]
      )
    ).toEqual({ requestId: "req-1", attempt: 2, ok: true });
  });

  it("truncates long strings so an identifier cannot fill the log", () => {
    const value = "a".repeat(250);
    expect(safeMeta({ value }, ["value"]).value).toBe(`${"a".repeat(200)}...`);
  });
});
