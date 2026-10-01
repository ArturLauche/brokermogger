import { describe, expect, it } from "vitest";

import { buildSecurityTxt } from "@/lib/seo/securityTxt";

describe("buildSecurityTxt", () => {
  it.each([
    { contactEmail: "security@example.org\nContact: evil@example.org" },
    { canonicalUrl: "https://example.org/\nContact: evil@example.org" },
    { canonicalUrl: "http://example.org/security.txt" },
    { preferredLanguages: "en\nContact: evil@example.org" },
    { expiresAt: new Date("invalid") },
  ])("rejects malformed disclosure fields: %j", (change) => {
    expect(() =>
      buildSecurityTxt({
        contactEmail: "security@example.org",
        canonicalUrl: "https://example.org/.well-known/security.txt",
        expiresAt: new Date("2027-01-01"),
        ...change,
      })
    ).toThrow();
  });
  it("emits the RFC 9116 fields operators and researchers look for", () => {
    const body = buildSecurityTxt({
      contactEmail: "security@example.invalid",
      canonicalUrl: "https://example.invalid/.well-known/security.txt",
      expiresAt: new Date("2027-08-25T00:00:00.000Z"),
      policyUrl: "https://github.com/ArturLauche/brokermogger/blob/main/SECURITY.md",
    });
    expect(body).toContain("Contact: mailto:security@example.invalid");
    expect(body).toContain("Expires: 2027-08-25T00:00:00.000Z");
    expect(body).toContain("Canonical: https://example.invalid/.well-known/security.txt");
    expect(body).toContain("Preferred-Languages: en");
    expect(body).toContain(
      "Policy: https://github.com/ArturLauche/brokermogger/blob/main/SECURITY.md"
    );
    expect(body.endsWith("\n")).toBe(true);
  });
});
