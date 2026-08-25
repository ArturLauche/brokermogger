import { describe, expect, it } from "vitest";

import { buildSecurityTxt } from "@/lib/seo/securityTxt";

describe("buildSecurityTxt", () => {
  it("emits the RFC 9116 fields operators and researchers look for", () => {
    const body = buildSecurityTxt({
      contactEmail: "security@example.invalid",
      canonicalUrl: "https://example.invalid/.well-known/security.txt",
      expiresAt: new Date("2027-08-25T00:00:00.000Z"),
      policyUrl: "https://github.com/ArturLauche/brokermogger/blob/main/SECURITY.md",
    });
    expect(body).toContain("Contact: mailto:security@example.invalid");
    expect(body).toContain("Expires: Wed, 25 Aug 2027 00:00:00 GMT");
    expect(body).toContain("Canonical: https://example.invalid/.well-known/security.txt");
    expect(body).toContain("Preferred-Languages: en");
    expect(body).toContain(
      "Policy: https://github.com/ArturLauche/brokermogger/blob/main/SECURITY.md"
    );
    expect(body.endsWith("\n")).toBe(true);
  });
});
