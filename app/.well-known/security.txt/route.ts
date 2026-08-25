import { env } from "@/lib/config/env";
import { DEFAULT_REPOSITORY_URL } from "@/lib/config/site";
import { absoluteUrl } from "@/lib/seo/crawling";
import { buildSecurityTxt } from "@/lib/seo/securityTxt";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const body = buildSecurityTxt({
    contactEmail: env.SECURITY_CONTACT_EMAIL,
    canonicalUrl: absoluteUrl(env.APP_BASE_URL, "/.well-known/security.txt"),
    expiresAt,
    policyUrl: `${DEFAULT_REPOSITORY_URL}/blob/main/SECURITY.md`,
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
