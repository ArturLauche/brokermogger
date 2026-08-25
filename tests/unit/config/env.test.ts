import { afterEach, describe, expect, it, vi } from "vitest";

import { getEnv, resetEnvCacheForTests } from "@/lib/config/env";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCacheForTests();
});

describe("environment cross-field checks", () => {
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
