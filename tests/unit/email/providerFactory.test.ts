/**
 * Provider selection. The factory must follow EMAIL_PROVIDER, memoise the
 * instance and stay overridable from tests.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetEnvCacheForTests } from "@/lib/config/env";
import {
  getEmailProvider,
  MockEmailProvider,
  ResendEmailProvider,
  SandboxEmailProvider,
  setEmailProviderForTests,
} from "@/lib/email";

function withEmailProvider(value: string, extra: Record<string, string> = {}): void {
  vi.stubEnv("EMAIL_PROVIDER", value);
  for (const [key, entry] of Object.entries(extra)) {
    vi.stubEnv(key, entry);
  }
  resetEnvCacheForTests();
  setEmailProviderForTests();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCacheForTests();
  setEmailProviderForTests();
});

describe("email provider factory", () => {
  it("returns the mock provider by default", () => {
    withEmailProvider("mock");
    expect(getEmailProvider()).toBeInstanceOf(MockEmailProvider);
    expect(getEmailProvider().kind).toBe("MOCK");
  });

  it("memoises the instance", () => {
    withEmailProvider("mock");
    expect(getEmailProvider()).toBe(getEmailProvider());
  });

  it("returns the sandbox provider when configured", () => {
    withEmailProvider("sandbox", {
      EMAIL_SANDBOX_REDIRECT_TO: "sandbox@example.invalid",
      APP_ENV: "staging",
    });
    expect(getEmailProvider()).toBeInstanceOf(SandboxEmailProvider);
    expect(getEmailProvider().kind).toBe("SANDBOX");
  });

  it("returns the resend provider outside development", () => {
    withEmailProvider("resend", {
      RESEND_API_KEY: "re_test_key",
      APP_ENV: "staging",
    });
    expect(getEmailProvider()).toBeInstanceOf(ResendEmailProvider);
    expect(getEmailProvider().kind).toBe("RESEND");
  });

  it("lets a test replace the provider and restore it again", () => {
    withEmailProvider("mock");
    const replacement = new MockEmailProvider();
    setEmailProviderForTests(replacement);
    expect(getEmailProvider()).toBe(replacement);

    setEmailProviderForTests();
    expect(getEmailProvider()).not.toBe(replacement);
  });
});
