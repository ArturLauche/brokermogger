import type { BrokerCategory, RequestType } from "@prisma/client";
import { US_PRIVACY_PACKS } from "@/lib/jurisdiction/us";

/** Small primary-source drafts. No contact, coverage or response behavior is verified. */
export interface RealBrokerDraftSeed {
  slug: string;
  legalName: string;
  tradingNames: string[];
  websiteUrl: string;
  category: BrokerCategory;
  countriesServed: string[];
  sourceUrl: string;
  sourceTitle: string;
  portalUrl: string;
  portalLabel: string;
  supportedRequestTypes: RequestType[];
  coverageCodes: string[];
  accountRequired: boolean;
  instructions: string;
  additionalSources?: { title: string; url: string }[];
}

const US_COVERAGE = [
  "US-CA",
  ...US_PRIVACY_PACKS.map((pack) => `US-${pack.region}`),
  "US-OTHER",
];
export const BROKER_SOURCE_REVIEWED_AT = "2026-09-30T00:00:00.000Z";
export const REAL_BROKER_DRAFTS: readonly RealBrokerDraftSeed[] = [
  {
    slug: "epsilon",
    legalName: "Epsilon",
    tradingNames: [],
    websiteUrl: "https://www.epsilon.com/",
    category: "MARKETING_LIST_PROVIDER",
    countriesServed: ["US"],
    sourceUrl: "https://legal.epsilon.com/dsr",
    sourceTitle: "Epsilon, Consumer Privacy Rights and request form",
    portalUrl: "https://legal.epsilon.com/dsr",
    portalLabel: "Official consumer request form",
    supportedRequestTypes: ["ACCESS", "CORRECTION", "DELETION", "OPT_OUT"],
    coverageCodes: US_COVERAGE,
    accountRequired: false,
    instructions:
      "Operator verification required. The official consumer form selects country and request details. Complete it yourself; the instance does not automate forms or verification. Agent requests need additional written authority under the applicable law. The published employee address is a different purpose and is not a general broker contact. Confirm legal entity, territory, offered request types and minimum fields before enabling this entry; no response behavior has been observed.",
    additionalSources: [
      {
        title: "Epsilon global privacy policies",
        url: "https://legal.epsilon.com/global-privacy-policies",
      },
    ],
  },
  {
    slug: "liveramp",
    legalName: "LiveRamp",
    tradingNames: [],
    websiteUrl: "https://liveramp.com/",
    category: "ADTECH_AUDIENCE_DATA",
    countriesServed: ["US"],
    sourceUrl: "https://liveramp.com/privacy/my-privacy-choices",
    sourceTitle: "LiveRamp, Your Privacy Choices — USA",
    portalUrl: "https://liveramp.com/privacy/my-privacy-choices",
    portalLabel: "Official privacy choices and portal instructions",
    supportedRequestTypes: ["ACCESS", "CORRECTION", "DELETION", "OPT_OUT"],
    coverageCodes: US_COVERAGE,
    accountRequired: false,
    instructions:
      "Operator verification required. Choose the matching consumer opt-out or rights-request route on the official page. Deletion/access can require residence and identity verification performed directly with the provider. Access before deletion can preserve the ability to inspect its report. Opt-out restricts future uses and differs from deletion; a device or cookie-only choice has narrower scope. Verify each jurisdiction and agent requirement, and decline unnecessary identity disclosure. No portal automation or observed response claim is supplied.",
  },
  {
    slug: "peopleconnect",
    legalName: "The Control Group Media Company LLC, dba PeopleConnect",
    tradingNames: ["PeopleConnect"],
    websiteUrl: "https://peopleconnect.us/",
    category: "PEOPLE_SEARCH",
    countriesServed: ["US"],
    sourceUrl: "https://suppression.peopleconnect.us/privacy-center",
    sourceTitle: "PeopleConnect, Suppression Center Privacy Center",
    portalUrl: "https://suppression.peopleconnect.us/",
    portalLabel: "Public-search suppression tool",
    supportedRequestTypes: ["SUPPRESSION"],
    coverageCodes: US_COVERAGE,
    accountRequired: true,
    instructions:
      "Operator verification required. Use the suppression tool personally to manage public-search display, including its email verification and identity settings. The Privacy Center's Right to Delete concerns website user data: deleting it can also delete the associated suppressions. It is not a substitute for suppressing public-search results. Keep these actions separate and confirm the intended result. The instance does not create accounts, collect the tool's extra identity fields or bypass verification. Legal jurisdiction coverage and agent authority remain unverified.",
    additionalSources: [
      {
        title: "PeopleConnect website privacy policy and legal entity",
        url: "https://peopleconnect.us/privacy-policy/",
      },
    ],
  },
];
