import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "@/lib/security/contentSecurityPolicy";

describe("runtime content security policy", () => {
  it("keeps production scripts and style elements protected while allowing control positioning", () => {
    const csp = buildContentSecurityPolicy("test-nonce", {
      development: false,
      https: true,
    });
    expect(csp.split("; ").find((value) => value.startsWith("script-src "))).toBe(
      "script-src 'self' 'nonce-test-nonce' 'strict-dynamic'"
    );
    expect(csp).toContain("style-src 'self' 'nonce-test-nonce'");
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("limits development exceptions to the actual development server", () => {
    const csp = buildContentSecurityPolicy("test-nonce", {
      development: true,
      https: false,
    });
    expect(csp).toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
