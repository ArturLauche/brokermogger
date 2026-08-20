/**
 * Route level role comparison and cookie naming.
 *
 * These are the parts of the auth slice that can be exercised without the
 * Auth.js runtime; the session dependent guards are covered by the integration
 * tests and by the flow itself.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { roleSatisfies } from "@/lib/auth/roles";
import {
  callbackUrlCookieName,
  csrfCookieName,
  secureCookiesEnabled,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/auth/cookies";
import { resetEnvCacheForTests } from "@/lib/config/env";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCacheForTests();
});

describe("roleSatisfies", () => {
  it("lets every role reach a USER area", () => {
    expect(roleSatisfies("USER", "USER")).toBe(true);
    expect(roleSatisfies("USER", "MAINTAINER")).toBe(true);
    expect(roleSatisfies("USER", "INSTANCE_ADMIN")).toBe(true);
  });

  it("treats INSTANCE_ADMIN as a MAINTAINER", () => {
    expect(roleSatisfies("MAINTAINER", "INSTANCE_ADMIN")).toBe(true);
    expect(roleSatisfies("MAINTAINER", "MAINTAINER")).toBe(true);
    expect(roleSatisfies("MAINTAINER", "USER")).toBe(false);
  });

  it("does not promote anyone into INSTANCE_ADMIN", () => {
    expect(roleSatisfies("INSTANCE_ADMIN", "INSTANCE_ADMIN")).toBe(true);
    expect(roleSatisfies("INSTANCE_ADMIN", "MAINTAINER")).toBe(false);
    expect(roleSatisfies("INSTANCE_ADMIN", "USER")).toBe(false);
  });
});

describe("cookie policy", () => {
  it("uses plain names over http in development", () => {
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    resetEnvCacheForTests();

    expect(secureCookiesEnabled()).toBe(false);
    expect(sessionCookieName()).toBe("authjs.session-token");
    expect(csrfCookieName()).toBe("authjs.csrf-token");
    expect(callbackUrlCookieName()).toBe("authjs.callback-url");
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it("uses prefixed, secure names as soon as the instance runs over https", () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("APP_BASE_URL", "https://desk.example.org");
    resetEnvCacheForTests();

    expect(secureCookiesEnabled()).toBe(true);
    expect(sessionCookieName()).toBe("__Secure-authjs.session-token");
    expect(csrfCookieName()).toBe("__Host-authjs.csrf-token");

    const options = sessionCookieOptions();
    expect(options.secure).toBe(true);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });
});
