import { describe, expect, it } from "vitest";
import { authRedirect } from "@/lib/auth/redirect";
describe("authentication redirect origin", () => {
  it("uses the configured deployment origin including its port", () => {
    expect(authRedirect("/dashboard", "http://127.0.0.1:3217")).toBe(
      "http://127.0.0.1:3217/dashboard"
    );
    expect(
      authRedirect("https://desk.example.org/vault", "https://desk.example.org")
    ).toBe("https://desk.example.org/vault");
    expect(authRedirect("/login", "https://desk.example.org")).toBe(
      "https://desk.example.org/login"
    );
  });
  it("rejects different origins, protocol-relative URLs and non-web schemes", () => {
    for (const input of [
      "//elsewhere.invalid",
      "https://elsewhere.invalid/",
      "javascript:alert(1)",
      "https://desk.example.org@elsewhere.invalid",
      "http://desk.example.org",
      "http://localhost:3217/",
    ]) {
      expect(authRedirect(input, "https://desk.example.org")).toBe(
        "https://desk.example.org/dashboard"
      );
    }
  });
});

it("pins issued magic links to the configured origin while preserving the callback and token", async () => {
  const { magicLinkUrlForInstance } = await import("@/lib/auth/redirect");
  const link = magicLinkUrlForInstance(
    "http://untrusted.example.invalid:4000/api/auth/callback/magic-link?token=synthetic-token&email=synthetic%40example.org&callbackUrl=%2Fdashboard#ignored",
    "https://privacy.example.org"
  );
  const parsed = new URL(link);
  expect(parsed.origin).toBe("https://privacy.example.org");
  expect(parsed.pathname).toBe("/api/auth/callback/magic-link");
  expect(parsed.searchParams.get("token")).toBe("synthetic-token");
  expect(parsed.searchParams.get("email")).toBe("synthetic@example.org");
  expect(parsed.hash).toBe("");
});
