import type { Metadata } from "next";
import type { ReactNode } from "react";
import { connection } from "next/server";

import { env } from "@/lib/config/env";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_SHORT_DESCRIPTION,
  SITE_TAGLINE,
} from "@/lib/config/site";

import "./globals.css";

// Nonces and deployment metadata must be evaluated for each actual request,
// including the root 404. Build placeholders must never enter served HTML.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(env.APP_BASE_URL),
    title: {
      default: SITE_NAME,
      template: `%s | ${SITE_NAME}`,
    },
    applicationName: SITE_NAME,
    description: SITE_DESCRIPTION,
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    category: "privacy",
    robots: {
      index: false,
      follow: false,
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: SITE_TAGLINE,
      description: SITE_SHORT_DESCRIPTION,
      locale: "en",
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TAGLINE,
      description: SITE_SHORT_DESCRIPTION,
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
