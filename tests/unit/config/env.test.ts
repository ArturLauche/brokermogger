import { afterEach, describe, expect, it, vi } from "vitest";

import { getEnv, resetEnvCacheForTests } from "@/lib/config/env";
import { randomBytes } from "node:crypto";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCacheForTests();
});

describe("environment cross-field checks", () => {
  it("refuses the build bypass at runtime", () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "true");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    resetEnvCacheForTests();
    expect(() => getEnv()).toThrow(/only.*compil/i);
  });

  it.each([
    "bad.id:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=,v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=!!!",
  ])("refuses malformed or ambiguous encryption keys", (keys) => {
    vi.stubEnv("ENCRYPTION_KEYS", keys);
    resetEnvCacheForTests();
    expect(() => getEnv()).toThrow(/ENCRYPTION_KEYS/);
  });

  it("refuses decoded example keys in production", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://privacy.example.org");
    vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("base64"));
    vi.stubEnv("EMAIL_PROVIDER", "sandbox");
    vi.stubEnv("EMAIL_SANDBOX_REDIRECT_TO", "sandbox@example.org");
    vi.stubEnv("STORAGE_BACKEND", "local");
    vi.stubEnv("ENCRYPTION_KEYS", "v1:ZGV2LW9ubHkta2V5LWRvLW5vdC11c2UtaW4tcHJvZAA=");
    resetEnvCacheForTests();
    expect(() => getEnv()).toThrow(/example|test|placeholder/);
  });

  it("accepts the CI e2e combination: Node production, APP_ENV development, mock email", () => {
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "mock");
    vi.stubEnv("STORAGE_BACKEND", "memory");
    vi.stubEnv("ALLOW_EXTERNAL_SENDING", "false");
    resetEnvCacheForTests();

    const parsed = getEnv();
    expect(parsed.isProduction).toBe(false);
    expect(parsed.NODE_ENV).toBe("production");
    expect(parsed.EMAIL_PROVIDER).toBe("mock");
  });

  it("refuses mock email when APP_ENV is production", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://example.invalid");
    vi.stubEnv("AUTH_SECRET", "production-auth-secret-value-32chars!");
    vi.stubEnv("EMAIL_PROVIDER", "mock");
    vi.stubEnv("STORAGE_BACKEND", "local");
    resetEnvCacheForTests();

    expect(() => getEnv()).toThrow(/EMAIL_PROVIDER=mock is not allowed in production/);
  });

  it("refuses memory storage when APP_ENV is production", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "https://example.invalid");
    vi.stubEnv("AUTH_SECRET", "production-auth-secret-value-32chars!");
    vi.stubEnv("EMAIL_PROVIDER", "sandbox");
    vi.stubEnv("EMAIL_SANDBOX_REDIRECT_TO", "sandbox@example.invalid");
    vi.stubEnv("STORAGE_BACKEND", "memory");
    resetEnvCacheForTests();

    expect(() => getEnv()).toThrow(/STORAGE_BACKEND=memory is not allowed in production/);
  });

  it("refuses http APP_BASE_URL when APP_ENV is production", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "http://example.invalid");
    vi.stubEnv("AUTH_SECRET", "production-auth-secret-value-32chars!");
    vi.stubEnv("EMAIL_PROVIDER", "sandbox");
    vi.stubEnv("EMAIL_SANDBOX_REDIRECT_TO", "sandbox@example.invalid");
    vi.stubEnv("STORAGE_BACKEND", "local");
    resetEnvCacheForTests();

    expect(() => getEnv()).toThrow(/APP_BASE_URL must use https in production/);
  });
});
