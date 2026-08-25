/**
 * Structured data for the public landing page.
 *
 * Emitted as JSON-LD only. It describes the software and restates the same
 * FAQ answers already visible on the page. It does not add on-screen copy.
 */
import { PUBLIC_FAQ_ITEMS } from "@/lib/content/faq";
import {
  DEFAULT_REPOSITORY_URL,
  LICENSE_NAME,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/config/site";

export function buildLandingJsonLd(input: {
  baseUrl: string;
  repositoryUrl: string;
}): Record<string, unknown>[] {
  const pageUrl = input.baseUrl.replace(/\/+$/, "");
  const repositoryUrl = input.repositoryUrl || DEFAULT_REPOSITORY_URL;

  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: pageUrl,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: pageUrl,
      sameAs: [repositoryUrl],
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web",
      license: LICENSE_NAME,
      isAccessibleForFree: true,
      url: pageUrl,
      description: SITE_DESCRIPTION,
      codeRepository: repositoryUrl,
      featureList: [
        SITE_TAGLINE,
        "Nothing is sent to a broker without an approved snapshot.",
        "Self hostable under AGPL-3.0-or-later.",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: PUBLIC_FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ];
}

/** Prevents `</script>` breakout if a string ever contains that sequence. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}
