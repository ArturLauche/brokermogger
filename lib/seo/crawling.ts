/**
 * Crawl rules for the public surface of an instance.
 *
 * Authenticated routes, magic-link pages and APIs must not be indexed. The
 * only document that should appear in a sitemap is the landing page.
 */
export const INDEXABLE_PATHS = ["/"] as const;

export const DISALLOWED_CRAWL_PREFIXES = [
  "/login",
  "/dashboard",
  "/onboarding",
  "/vault",
  "/household",
  "/brokers",
  "/requests",
  "/evidence",
  "/reports",
  "/settings",
  "/admin",
  "/api/",
] as const;

export function absoluteUrl(baseUrl: string, path: string): string {
  const origin = baseUrl.replace(/\/+$/, "");
  if (path === "/") return origin;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
