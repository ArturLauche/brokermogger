/**
 * JSON-LD script tag. No visible UI.
 *
 * The CSP nonce comes from `proxy.ts` so this inline document is allowed under
 * `script-src 'nonce-...'`. Search engines still read the JSON as data.
 */
import { headers } from "next/headers";

import { serializeJsonLd } from "@/lib/seo/jsonld";

export async function JsonLd({ data }: { data: unknown }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
