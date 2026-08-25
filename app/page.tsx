import type { Metadata } from "next";

import { InstancePublicFooter } from "@/components/layout/instance-public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { JsonLd } from "@/components/seo/json-ld";
import { ClosingCta } from "@/components/marketing/closing-cta";
import { CountryCoverage } from "@/components/marketing/country-coverage";
import { Faq } from "@/components/marketing/faq";
import { FreeAccess } from "@/components/marketing/free-access";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Limitations } from "@/components/marketing/limitations";
import { OpenSource } from "@/components/marketing/open-source";
import { SecurityPrinciples } from "@/components/marketing/security-principles";
import { SelfHosting } from "@/components/marketing/self-hosting";
import { WhyItMatters } from "@/components/marketing/why-it-matters";
import { env } from "@/lib/config/env";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/config/site";
import { getPublicInstanceLinks } from "@/lib/config/runtimeSettings";
import { buildLandingJsonLd } from "@/lib/seo/jsonld";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} — ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: SITE_TAGLINE,
    description: SITE_DESCRIPTION,
    url: "/",
  },
};

export const dynamic = "force-dynamic";

/**
 * Landing page.
 *
 * A server component with no client state: everything except the FAQ accordion
 * renders and reads without JavaScript.
 */
export default async function LandingPage() {
  let repositoryUrl = "";
  try {
    repositoryUrl = (await getPublicInstanceLinks()).repositoryUrl;
  } catch {
    repositoryUrl = "";
  }

  return (
    <>
      <JsonLd data={buildLandingJsonLd({ baseUrl: env.APP_BASE_URL, repositoryUrl })} />
      <PublicHeader />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <Hero />
        <HowItWorks />
        <CountryCoverage />
        <WhyItMatters />
        <Limitations />
        <SecurityPrinciples />
        <FreeAccess />
        <OpenSource />
        <SelfHosting />
        <Faq />
        <ClosingCta />
      </main>
      <InstancePublicFooter />
    </>
  );
}
