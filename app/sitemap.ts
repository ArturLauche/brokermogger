import type { MetadataRoute } from "next";

import { env } from "@/lib/config/env";
import { absoluteUrl, INDEXABLE_PATHS } from "@/lib/seo/crawling";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_PATHS.map((path) => ({
    url: absoluteUrl(env.APP_BASE_URL, path),
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
