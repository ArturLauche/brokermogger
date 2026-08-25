import { describe, expect, it } from "vitest";

import { hasValidBearerToken, timingSafeEqualString } from "@/lib/security/timingSafe";

describe("timingSafeEqualString", () => {
  it("accepts identical secrets of different lengths without throwing", () => {
    expect(timingSafeEqualString("alpha", "alpha")).toBe(true);
    expect(timingSafeEqualString("alpha", "beta")).toBe(false);
    expect(timingSafeEqualString("short", "much-longer-secret")).toBe(false);
  });
});

describe("hasValidBearerToken", () => {
  it("requires the exact Bearer prefix and secret", () => {
    expect(hasValidBearerToken("Bearer s3cret", "s3cret")).toBe(true);
    expect(hasValidBearerToken("Bearer other", "s3cret")).toBe(false);
    expect(hasValidBearerToken("s3cret", "s3cret")).toBe(false);
    expect(hasValidBearerToken(null, "s3cret")).toBe(false);
    expect(hasValidBearerToken("Bearer s3cret", "")).toBe(false);
  });
});
