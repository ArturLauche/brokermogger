import { beforeEach, describe, expect, it, vi } from "vitest";
const config = vi.hoisted(() => ({
  SECURITY_CONTACT_EMAIL: "security@example.invalid",
  APP_BASE_URL: "https://privacy.example.org",
}));
vi.mock("@/lib/config/env", () => ({ env: config }));
const { GET } = await import("@/app/.well-known/security.txt/route");
beforeEach(() => {
  config.SECURITY_CONTACT_EMAIL = "security@example.invalid";
  config.APP_BASE_URL = "https://privacy.example.org";
});

describe("instance disclosure contact", () => {
  it("does not publish a placeholder contact", async () => {
    const response = await GET();
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).not.toContain("security@example.invalid");
  });
  it("publishes an operator contact and runtime HTTPS canonical with a valid expiry", async () => {
    config.SECURITY_CONTACT_EMAIL = "security@example.org";
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Contact: mailto:security@example.org");
    expect(body).toContain(`Canonical: ${config.APP_BASE_URL}/.well-known/security.txt`);
    const expiry = body
      .split("\n")
      .find((line) => line.startsWith("Expires: "))!
      .slice(9);
    expect(expiry).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Date.parse(expiry)).toBeGreaterThan(Date.now());
    expect(Date.parse(expiry) - Date.now()).toBeLessThan(181 * 86400_000);
  });
  it("omits an invalid HTTP canonical on local development instances", async () => {
    config.SECURITY_CONTACT_EMAIL = "security@example.org";
    config.APP_BASE_URL = "http://localhost:3000";
    expect(await (await GET()).text()).not.toContain("Canonical:");
  });
});
