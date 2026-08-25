import type { MetadataRoute } from "next";

import { env } from "@/lib/config/env";
import { absoluteUrl, DISALLOWED_CRAWL_PREFIXES } from "@/lib/seo/crawling";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/llms.txt", "/.well-known/security.txt"],
        disallow: [...DISALLOWED_CRAWL_PREFIXES],
      },
    ],
    sitemap: absoluteUrl(env.APP_BASE_URL, "/sitemap.xml"),
  };
}
