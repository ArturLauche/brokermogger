import type { Metadata } from "next";

import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
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

export const metadata: Metadata = {
  title: "Prepare, approve and track your own privacy requests",
  description:
    "Brokermogger is a free and open source privacy request desk. It prepares privacy requests to data brokers, shows you the exact text, and sends nothing without your approval.",
};

/**
 * Landing page.
 *
 * A server component with no client state: everything except the FAQ accordion
 * renders and reads without JavaScript.
 */
export default function LandingPage() {
  return (
    <>
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
      <PublicFooter />
    </>
  );
}
