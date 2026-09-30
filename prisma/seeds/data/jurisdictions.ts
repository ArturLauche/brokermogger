/**
 * Jurisdictions shipped with every instance.
 *
 * Pure data: no database access, no Prisma runtime import. The writer in
 * `prisma/seeds/jurisdictions.ts` turns these records into rows.
 */

import { GDPR_COUNTRIES } from "@/lib/jurisdiction/eea";
import { US_PRIVACY_PACKS, usPackName } from "@/lib/jurisdiction/us";
import { FUTURE_US_PRIVACY_PACKS } from "@/lib/jurisdiction/futureUs";

export interface JurisdictionSeed {
  /** Stable machine key referenced by legal rules, templates and brokers. */
  code: string;
  name: string;
  /** ISO 3166-1 alpha-2 country code. */
  countryCode: string;
  /** ISO 3166-2 subdivision code without the country prefix, where applicable. */
  region?: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

export const JURISDICTIONS: readonly JurisdictionSeed[] = [
  {
    code: "US-CA",
    name: "California",
    countryCode: "US",
    region: "CA",
    description:
      "California residents. Covered by the CCPA as amended by the CPRA and, separately, by the California Delete Act and its deletion request platform.",
    isActive: true,
    sortOrder: 10,
  },
  {
    code: "US-OTHER",
    name: "United States — voluntary requests",
    countryCode: "US",
    description:
      "United States residents whose state has no supported statutory pack here. Only clearly labelled voluntary requests are offered; no uniform federal deletion right or another state's rights are assumed.",
    isActive: true,
    sortOrder: 20,
  },
  ...US_PRIVACY_PACKS.map((pack, index) => ({
    code: `US-${pack.region}`,
    name: usPackName(pack),
    countryCode: "US",
    region: pack.region,
    description: `${pack.lawName}. ${pack.scope}`,
    isActive: true,
    sortOrder: 200 + index,
  })),
  ...FUTURE_US_PRIVACY_PACKS.map((pack, index) => ({
    code: `US-${pack.region}`,
    name: usPackName(pack),
    countryCode: "US",
    region: pack.region,
    description: `${pack.lawName} is enacted for a future date and remains an unpublished draft. Current requests use clearly labelled voluntary broker policies. ${pack.scope}`,
    isActive: true,
    sortOrder: 250 + index,
  })),
  ...GDPR_COUNTRIES.map((country, index) => ({
    code: country.code,
    name: country.name,
    countryCode: country.code,
    description: `Shared GDPR rights in ${country.name}, with country-specific authority information. National exceptions, territorial applicability and public holidays require review.`,
    isActive: true,
    sortOrder: country.code === "DE" ? 30 : 100 + index,
  })),
  {
    code: "GB",
    name: "United Kingdom",
    countryCode: "GB",
    description:
      "United Kingdom residents under the UK GDPR and the Data Protection Act 2018. Escalation goes to the Information Commissioner's Office.",
    isActive: true,
    sortOrder: 40,
  },
  {
    code: "BR",
    name: "Brazil",
    countryCode: "BR",
    description:
      "Brazil residents under the Lei Geral de Protecao de Dados Pessoais (Lei 13.709/2018). Escalation goes to the ANPD.",
    isActive: true,
    sortOrder: 50,
  },
  {
    code: "IN",
    name: "India",
    countryCode: "IN",
    description:
      "India residents: clearly labelled voluntary requests before May 13, 2027; the DPDP statutory rights pack is scheduled for that date. Grievance timing is distinct from initial request timing.",
    isActive: true,
    sortOrder: 60,
  },
  {
    code: "AU",
    name: "Australia",
    countryCode: "AU",
    description:
      "Australia residents under the Privacy Act 1988 and the Australian Privacy Principles. Access, correction and direct marketing opt out, no general erasure right.",
    isActive: true,
    sortOrder: 70,
  },
  {
    code: "SG",
    name: "Singapore",
    countryCode: "SG",
    description:
      "Singapore residents under the Personal Data Protection Act 2012. Access, correction and withdrawal of consent, no general right to be forgotten.",
    isActive: true,
    sortOrder: 80,
  },
] as const;

export const JURISDICTION_CODES: readonly string[] = JURISDICTIONS.map(
  (jurisdiction) => jurisdiction.code
);
