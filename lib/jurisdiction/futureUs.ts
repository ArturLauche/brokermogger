import type { UsPrivacyPack } from "./us";

/** Enacted laws reviewed October 1, 2026. Seeded as drafts, never activated by time alone. */
const requests: UsPrivacyPack["requests"] = {
  ACCESS:
    "Confirm processing and provide the access and portable copy required by the applicable law, subject to statutory limits and protected trade secrets.",
  CORRECTION:
    "Correct inaccurate personal data about the named person, considering the data and its processing purposes. Please identify a secure channel for the disputed fields and proposed corrections.",
  DELETION:
    "Delete the personal data about the named person, subject to applicable exceptions. Explain retained records and any permitted alternative compliance measures. An opt-out is not proof of erasure.",
  OPT_OUT:
    "Apply the named person's opt-out of sale, targeted advertising and profiling with legal or similarly significant effects, to the extent covered by the applicable law. Explain which choices you applied.",
};

export const FUTURE_US_PRIVACY_PACKS: readonly UsPrivacyPack[] = [
  {
    region: "AL",
    lawName: "Alabama Personal Data Protection Act",
    citation: "Alabama Act 2026-552, sections 3 to 5 and 12",
    effectiveFrom: "2027-05-01T05:00:00.000Z",
    sourceUrl:
      "https://alison.legislature.state.al.us/files/pdf/SearchableInstruments/2026RS/HB351-enr.pdf",
    sourceTitle: "Alabama Legislature, HB 351 enrolled, Act 2026-552",
    authority: "Alabama Attorney General",
    authorityUrl: "https://www.alabamaag.gov/",
    scope:
      "From May 1, 2027: Alabama consumers and businesses operating in or targeting the state that process more than 25,000 consumers, excluding payment-only processing, or derive more than 25% of gross revenue from sale regardless of consumer count. Small businesses with fewer than 500 employees and nonprofits with fewer than 100 employees are exempt if they do not sell personal data; other entity and data exemptions need review.",
    note: "The enrolled Act permits limited retention or an alternative opt-out for third-party-sourced data. Profiling opt-out covers solely automated significant decisions. This future pack remains a draft until an operator verifies and publishes it; no present statutory right is asserted.",
    requests: {
      ...requests,
      OPT_OUT:
        "Apply the named person's opt-out of sale, targeted advertising and profiling in furtherance of solely automated significant decisions, to the extent covered by Alabama law. Explain which choices you applied.",
    },
    additionalSources: [
      {
        title: "Code of Alabama, section 8-44-3: enacted scope and effective date",
        url: "https://alison.legislature.state.al.us/code-of-alabama?section=8-44-3",
      },
    ],
  },
  {
    region: "LA",
    lawName: "Louisiana Data Privacy Act",
    citation: "Louisiana Act 502 of 2026, R.S. 51:1780.1 to 1780.5",
    effectiveFrom: "2027-01-01T06:00:00.000Z",
    sourceUrl: "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1480202",
    sourceTitle: "Louisiana Legislature, Act 502, SB 386 enrolled",
    authority: "Louisiana Attorney General",
    authorityUrl: "https://www.ag.state.la.us/",
    scope:
      "From January 1, 2027: a person or entity doing business in Louisiana with annual gross revenue exceeding $25 million, commercial buying/receiving/selling/sharing of personal information of at least 75,000 consumers, households or devices annually, or at least 50% of annual revenue from sale. Financial, health, nonprofit, higher-education and other exemptions need review.",
    note: "Sections 1780.2 and 1780.3 distinguish applicability from consumer rights and authentication. The enrolled Act's effective date is January 1, 2027. This future pack remains a draft until an operator verifies and publishes it; no present statutory right is asserted.",
    requests,
    additionalSources: [
      {
        title: "Louisiana Legislature, SB 386: signed Act 502 status",
        url: "https://www.legis.la.gov/legis/BillInfo.aspx?i=250945",
      },
    ],
  },
  {
    region: "OK",
    lawName: "Oklahoma Consumer Data Privacy Act",
    citation: "Oklahoma SB 546 enrolled, title 75A sections 300 to 320",
    effectiveFrom: "2027-01-01T06:00:00.000Z",
    sourceUrl: "https://www.oklegislature.gov/cf_pdf/2025-26%20ENR/SB/SB546%20ENR.PDF",
    sourceTitle: "Oklahoma Legislature, SB 546 enrolled",
    authority: "Oklahoma Attorney General",
    authorityUrl: "https://www.oag.ok.gov/",
    scope:
      "From January 1, 2027: businesses operating in or targeting Oklahoma that process at least 100,000 consumers in a calendar year, or at least 25,000 and derive more than 50% of gross revenue from sale. Public-sector, financial, health, nonprofit, higher-education and other entity/data exemptions need review.",
    note: "Enrolled sections 3, 15 and 22 govern response timing, scope and January 1, 2027 commencement. Third-party-sourced deletion can use limited retention or an alternative opt-out. This future pack remains a draft until an operator verifies and publishes it; no present statutory right is asserted.",
    requests,
    additionalSources: [
      {
        title: "Oklahoma House, March 23, 2026: SB 546 signed into law",
        url: "https://www.okhouse.gov/posts/news-20260323_2",
      },
    ],
  },
];
