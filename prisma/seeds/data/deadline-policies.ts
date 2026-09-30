import type { DeadlinePolicy } from "@/lib/jurisdiction/deadlines";

/** Primary-source timing review: 2026-09-30. Holiday coverage is deliberately not invented. */
export const GDPR_RESPONSE_POLICY: DeadlinePolicy = {
  version: 1,
  unit: "CALENDAR_MONTHS",
  period: 1,
  startsFrom: "RECEIPT",
  sourceUrl:
    "https://www.edpb.europa.eu/system/files/documents/2023-04/edpb_guidelines_202201_data_subject_rights_access_v2_en.pdf",
  verified: true,
  rollForward: "NEXT_WORKING_DAY",
  calendar: null,
  extension: {
    unit: "CALENDAR_MONTHS",
    period: 2,
    noticeRequired: true,
    conditions:
      "A necessary extension for complexity or number of requests requires reasons and notice within the first month. The extension is not automatic.",
  },
  conditions: [
    "Respond without undue delay. The baseline response period runs from receipt, not draft creation or approval.",
    "End on the corresponding date in the next month, or its last day where that date is absent. A weekend or public holiday moves the target to the next working day.",
    "Identity doubts, clarification and applicable national rules can affect timing. Brokermogger does not infer pauses.",
  ],
  notes:
    "EDPB Guidelines 01/2022, paragraphs 157–161, and GDPR Article 12(3). A country and locality's public holidays need separate verification; calculated dates remain estimates without that coverage.",
};

export const UK_GDPR_RESPONSE_POLICY: DeadlinePolicy = {
  ...GDPR_RESPONSE_POLICY,
  sourceUrl:
    "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-of-access/what-should-we-consider-when-responding-to-a-request/",
  conditions: [
    "The baseline is one calendar month from receipt. Identity or authority information can affect the start, and justified clarification can pause a subject access request.",
    "Use the corresponding date in the next month or its last day, then move a weekend or public holiday to the next working day.",
    "An extension for complexity or multiple requests needs timely notice. Pauses and extensions require an explicit review and are not applied automatically.",
  ],
  notes:
    "ICO response-timing guidance, including the Data (Use and Access) Act changes. Bank-holiday coverage varies within the UK and is not inferred from the account timezone.",
};

export const CCPA_RESPONSE_POLICY: DeadlinePolicy = {
  version: 1,
  unit: "CALENDAR_DAYS",
  period: 45,
  startsFrom: "RECEIPT",
  sourceUrl: "https://oag.ca.gov/privacy/ccpa",
  verified: true,
  rollForward: "NONE",
  calendar: null,
  extension: {
    unit: "CALENDAR_DAYS",
    period: 45,
    noticeRequired: true,
    conditions:
      "A further 45 days requires notice and an explanation within the initial response period.",
  },
  conditions: [
    "Only eligible California residents and covered businesses. Verification and legal exemptions can affect the outcome.",
  ],
  notes:
    "California Attorney General CCPA FAQs for requests to know, delete and correct. This response target is not a promise of deletion.",
};

export const CCPA_OPT_OUT_POLICY: DeadlinePolicy = {
  ...CCPA_RESPONSE_POLICY,
  unit: "BUSINESS_DAYS",
  period: 15,
  extension: null,
  conditions: [
    "Sale or sharing opt-out must be implemented as soon as feasible. It is distinct from deletion.",
  ],
  notes:
    "California Attorney General CCPA opt-out FAQ. The 15-business-day period is sourced; the applicable non-working-day and holiday calendar requires operator verification. Without it the calculation is explicitly estimated.",
};
