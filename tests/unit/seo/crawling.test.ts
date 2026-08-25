import { describe, expect, it } from "vitest";

import {
  absoluteUrl,
  DISALLOWED_CRAWL_PREFIXES,
  INDEXABLE_PATHS,
} from "@/lib/seo/crawling";
import { buildLandingJsonLd, serializeJsonLd } from "@/lib/seo/jsonld";

describe("public crawl surface", () => {
  it("indexes only the landing page and hides authenticated prefixes", () => {
    expect(INDEXABLE_PATHS).toEqual(["/"]);
    expect(DISALLOWED_CRAWL_PREFIXES).toContain("/dashboard");
    expect(DISALLOWED_CRAWL_PREFIXES).toContain("/api/");
    expect(DISALLOWED_CRAWL_PREFIXES).toContain("/login");
  });

  it("joins a base URL without a trailing slash", () => {
    expect(absoluteUrl("https://example.invalid/", "/")).toBe("https://example.invalid");
    expect(absoluteUrl("https://example.invalid", "/llms.txt")).toBe(
      "https://example.invalid/llms.txt"
    );
  });
});

describe("landing JSON-LD", () => {
  it("describes the software and reuses on-page FAQ answers", () => {
    const graph = buildLandingJsonLd({
      baseUrl: "https://example.invalid",
      repositoryUrl: "https://github.com/ArturLauche/brokermogger",
    });
    const types = graph.map((node) => node["@type"]);
    expect(types).toEqual(["WebSite", "Organization", "SoftwareApplication", "FAQPage"]);
    const software = graph.find((node) => node["@type"] === "SoftwareApplication");
    expect(software?.isAccessibleForFree).toBe(true);
    expect(software).not.toHaveProperty("offers");
    expect(JSON.stringify(software)).not.toMatch(/price/i);
    expect(software?.license).toBe("AGPL-3.0-or-later");
    const organization = graph.find((node) => node["@type"] === "Organization");
    expect(organization?.sameAs).toEqual(["https://github.com/ArturLauche/brokermogger"]);
  });

  it("escapes opening angle brackets so JSON-LD cannot break out of a script tag", () => {
    expect(serializeJsonLd({ note: "</script>" })).toContain("\\u003c/script>");
  });
});
