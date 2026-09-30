import type { RequestType, PublicationStatus } from "@prisma/client";

import { US_STATES } from "./locations";

export type UsInitialRequestType = Extract<
  RequestType,
  "ACCESS" | "CORRECTION" | "DELETION" | "OPT_OUT"
>;
export interface UsPrivacyPack {
  region: keyof typeof US_STATES;
  lawName: string;
  citation: string;
  effectiveFrom: string;
  sourceUrl: string;
  sourceTitle: string;
  authority: string;
  authorityUrl: string;
  /** Applicability is disclosed for review, never inferred from residency alone. */
  scope: string;
  note: string;
  responseDays?: number;
  extensionDays?: number;
  requests: Partial<Record<UsInitialRequestType, string>>;
  additionalSources?: { title: string; url: string }[];
  future?: {
    effectiveFrom: string;
    sourceUrl: string;
    note: string;
    scope?: string;
    requests?: Partial<Record<UsInitialRequestType, string>>;
    status?: PublicationStatus;
  }[];
}

const ACCESS =
  "Confirm whether you process personal data about the named person and provide the access and portable copy required by the applicable law, subject to its limits.";
const DELETION =
  "Delete the personal data provided by, or obtained about, the named person, subject to applicable exceptions. Explain any retained records and any alternative compliance measures you use.";
const PROVIDED_DELETION =
  "Delete the personal data the named person provided to you, subject to applicable exceptions. Other data is included only if you voluntarily agree; explain what you retain and why.";
const CORRECTION =
  "Correct inaccurate personal data about the named person, taking account of the data and its processing purposes. Please identify a secure channel for the disputed fields and proposed corrections.";
const OPT_OUT =
  "Apply the named person's opt-out of sale, targeted advertising and profiling that produces legal or similarly significant effects, to the extent covered by the applicable law. Explain which choices you applied.";
const STANDARD_REQUESTS = { ACCESS, CORRECTION, DELETION, OPT_OUT };

/**
 * Primary-source adult consumer baseline reviewed 2026-09-30. California uses
 * its existing CCPA packs. Conditions and narrower rights are deliberately data,
 * so the rule and letter factories cannot silently broaden a state's rights.
 */
export const US_PRIVACY_PACKS: readonly UsPrivacyPack[] = [
  {
    region: "CO",
    lawName: "Colorado Privacy Act",
    citation: "Colorado Revised Statutes sections 6-1-1301 to 6-1-1313",
    effectiveFrom: "2023-07-01T06:00:00.000Z",
    sourceUrl: "https://coag.gov/resources/colorado-privacy-act/",
    sourceTitle: "Colorado Attorney General, Colorado Privacy Act FAQs",
    authority: "Colorado Attorney General",
    authorityUrl: "https://coag.gov/resources/colorado-privacy-act/",
    scope:
      "Colorado consumers acting in an individual or household context; controllers meeting the 100,000-consumer threshold or the 25,000-consumer and sale-revenue/discount alternative. Nonprofits can be covered; financial, health and other exemptions need review.",
    note: "A profiling opt-out concerns decisions with legal or similarly significant effects, not every analysis. Verify the designated submission method and any agent authority before sending.",
    requests: STANDARD_REQUESTS,
    additionalSources: [
      {
        title: "Colorado Privacy Act Rules, response procedure",
        url: "https://coag.gov/app/uploads/2023/03/FINAL-CLEAN-2023.03.15-Official-CPA-Rules.pdf",
      },
    ],
  },
  {
    region: "CT",
    lawName: "Connecticut Data Privacy Act",
    citation: "Connecticut General Statutes sections 42-515 to 42-526, as amended",
    effectiveFrom: "2026-07-01T04:00:00.000Z",
    sourceUrl: "https://www.cga.ct.gov/2026/sup/chap_743jj.htm",
    sourceTitle: "Connecticut General Assembly, 2026 supplement, Chapter 743jj",
    authority: "Connecticut Attorney General",
    authorityUrl:
      "https://portal.ct.gov/ag/sections/privacy/the-connecticut-data-privacy-act/",
    scope:
      "Under the July 2026 amendments, coverage includes the 35,000-consumer threshold (excluding payment-only processing), processing sensitive data, or offering personal data for sale. Residency, consumer context and remaining entity/data exemptions still need review.",
    note: "Access includes covered inferences and profiling information. Additional October 2026 provisions and the later broker deletion mechanism have separate effective dates; no central deletion submission is performed by this instance.",
    requests: {
      ...STANDARD_REQUESTS,
      ACCESS:
        "Confirm processing and provide the access and copy required by Connecticut law, including covered inferences and profiling information, subject to trade-secret and protected-data limits.",
    },
    additionalSources: [
      {
        title: "Connecticut Attorney General, current CTDPA guidance",
        url: "https://portal.ct.gov/ag/sections/privacy/the-connecticut-data-privacy-act/",
      },
    ],
    future: [
      {
        effectiveFrom: "2026-10-01T04:00:00.000Z",
        sourceUrl:
          "https://www.cga.ct.gov/2026/ACT/PA/PDF/2026PA-00064-R00SB-00004-PA.PDF",
        note: "Public Act 26-64 sections 11–16 expand covered profiling and deletion of specified publicly available consumer profiles and inferences, and restrict precise-geolocation disclosures. The broker registry begins January 2027; the central deletion mechanism must be established by July 2028 and broker processing begins October 2028. These are distinct from direct requests.",
        requests: {
          ...STANDARD_REQUESTS,
          ACCESS:
            "Confirm processing and provide the access and copy required by Connecticut law, including covered inferences and profiling information, subject to trade-secret and protected-data limits.",
          DELETION:
            "Delete personal data provided by, or obtained about, the named person, and the publicly available consumer profiles and related inferences covered by section 42-518(a)(3), subject to applicable exceptions. Explain what you retain and why.",
        },
      },
    ],
  },
  {
    region: "DE",
    lawName: "Delaware Personal Data Privacy Act",
    citation: "Delaware Code title 6, Chapter 12D",
    effectiveFrom: "2025-01-01T05:00:00.000Z",
    sourceUrl: "https://delcode.delaware.gov/title6/c012D/index.html",
    sourceTitle: "Delaware Code, Chapter 12D, current and scheduled provisions",
    authority: "Delaware Department of Justice",
    authorityUrl:
      "https://attorneygeneral.delaware.gov/fraud/personal-data-privacy-portal/business/",
    scope:
      "Delaware residents acting in an individual or household context; 35,000 consumers excluding payment-only data, or at least 10,000 consumers and more than 20% of gross revenue from sale. Entity and data exemptions need review.",
    note: "Current profiling opt-out covers solely automated significant decisions. Deletion can retain a minimal record solely to keep third-party-sourced data deleted. Use the controller's appeal process before an agency complaint.",
    requests: STANDARD_REQUESTS,
    additionalSources: [
      {
        title: "Delaware HB 380 signed with HA 2, status and final text",
        url: "https://legis.delaware.gov/BillDetail?LegislationId=143105",
      },
    ],
    future: [
      {
        effectiveFrom: "2027-01-01T05:00:00.000Z",
        sourceUrl:
          "https://legis.delaware.gov/json/BillDetail/GeneratePdfEngrossment?engrossmentId=37933&docTypeId=6",
        scope:
          "The January 2027 provisions lower the thresholds to 10,000 consumers or 5,000 consumers and more than 20% sale revenue, and include third parties acquiring controller data. Review revised financial exemptions and third-party duties.",
        note: "85 Delaware Laws, Chapter 463 expands inference/profiling access and third-party transparency and broadens significant-decision profiling beyond solely automated decisions. The final HB 380 with HA 2 amends the marked provisions; unamended correction/deletion rights remain. Review the final text alongside the compiled code, which omits some unchanged paragraphs in its future section.",
        requests: {
          ...STANDARD_REQUESTS,
          ACCESS:
            "Confirm processing and provide the access and copy required by Delaware law, including covered inferences, profiling information and the applicable third-party list, subject to statutory protected-data and trade-secret limits.",
        },
      },
    ],
  },
  {
    region: "FL",
    lawName: "Florida Digital Bill of Rights",
    citation: "Florida Statutes sections 501.701 to 501.722",
    effectiveFrom: "2024-07-01T04:00:00.000Z",
    sourceUrl: "https://www.flsenate.gov/Laws/Statutes/2026/501.705",
    sourceTitle: "Florida Senate, 2026 Statutes, sections 501.705 and 501.706",
    authority: "Florida Department of Legal Affairs",
    authorityUrl: "https://www.myfloridalegal.com/",
    scope:
      "A covered for-profit controller generally exceeds one billion dollars in global annual gross revenue and also meets the specified online-advertising, integrated voice-assistant or 250,000-app-store condition. This is not a general right against every Florida business; affiliates and exemptions need review.",
    note: "The conditional extension is 15 days, not the 45 days used in many other states. Sensitive-data and voice/facial collection choices are not permission for this instance to collect those identifiers.",
    extensionDays: 15,
    requests: STANDARD_REQUESTS,
    additionalSources: [
      {
        title: "Florida controller definition and scope",
        url: "https://www.flsenate.gov/Laws/Statutes/2026/501.702",
      },
      {
        title: "Florida request response procedure",
        url: "https://www.flsenate.gov/Laws/Statutes/2026/501.706",
      },
    ],
  },
  {
    region: "IN",
    lawName: "Indiana Consumer Data Protection Act",
    citation: "Indiana Code title 24, article 15",
    effectiveFrom: "2026-01-01T05:00:00.000Z",
    sourceUrl:
      "https://www.in.gov/attorneygeneral/files/Consumer-Data-Bill-of-Rights.pdf",
    sourceTitle: "Indiana Attorney General, Consumer Data Bill of Rights",
    authority: "Indiana Attorney General",
    authorityUrl:
      "https://www.in.gov/attorneygeneral/consumer-protection-division/file-a-complaint/",
    scope:
      "Indiana consumers; 100,000 consumers or at least 25,000 and more than 50% of gross revenue from sale. Nonprofits, higher education, public utilities, financial and HIPAA-covered entities have exemptions.",
    note: "Access/copy or representative summary and correction are limited to data previously provided by the consumer; deletion has broader scope. Adult household consent is not assumed to establish the power of attorney or other legal authority described by the Attorney General. Have the individual submit directly where authority is unproven.",
    requests: {
      ...STANDARD_REQUESTS,
      ACCESS:
        "Confirm processing and provide the copy or representative summary of personal data previously provided by the named person, in the form required by Indiana law. I understand this does not require disclosure of other-source or inferred data.",
      CORRECTION:
        "Correct inaccurate personal data that the named person previously provided to you. Please identify a secure channel for the disputed fields and proposed corrections; this request does not assert correction rights over all other-source data.",
    },
  },
  {
    region: "IA",
    lawName: "Iowa Consumer Data Protection Act",
    citation: "Iowa Code Chapter 715D",
    effectiveFrom: "2025-01-01T06:00:00.000Z",
    sourceUrl: "https://www.legis.iowa.gov/docs/code/715D.pdf",
    sourceTitle: "Iowa Legislature, Iowa Code 2026, Chapter 715D",
    authority: "Iowa Attorney General",
    authorityUrl: "https://www.iowaattorneygeneral.gov/for-consumers",
    scope:
      "Iowa consumers; at least 100,000 consumers or 25,000 consumers and more than 50% sale revenue, with statutory entity/data exemptions.",
    note: "Deletion concerns data provided by the consumer. Chapter 715D does not give the correction right listed in many other states. This opt-out is sale-specific; do not broaden it to a statutory right against all profiling or advertising.",
    responseDays: 90,
    requests: {
      ACCESS,
      DELETION: PROVIDED_DELETION,
      OPT_OUT:
        "Apply the named person's opt-out of the sale of their personal data under Iowa Code Chapter 715D. Confirm its scope and effective date. This request does not assert a general profiling or targeted-advertising opt-out right.",
    },
  },
  {
    region: "KY",
    lawName: "Kentucky Consumer Data Protection Act",
    citation: "Kentucky Revised Statutes sections 367.3611 to 367.3629",
    effectiveFrom: "2026-01-01T05:00:00.000Z",
    sourceUrl:
      "https://www.ag.ky.gov/about/Office-Divisions/ODP/KCDPA/Pages/default.aspx",
    sourceTitle: "Kentucky Attorney General, rights under the KCDPA",
    authority: "Kentucky Attorney General, Office of Data Privacy",
    authorityUrl:
      "https://www.ag.ky.gov/about/Office-Divisions/ODP/KCDPA/Pages/default.aspx",
    scope:
      "Kentucky consumers; 100,000 consumers or the 25,000-consumer/50%-sale-revenue alternative. Government, nonprofits, higher education and specified data/entity exemptions need review.",
    note: "Use the controller's published request and appeal procedures. Excluded public information and legal retention can limit deletion; neither an agency complaint nor a successful outcome is automatic.",
    requests: STANDARD_REQUESTS,
    additionalSources: [
      {
        title: "Kentucky Legislature, Chapter 367, current and future statutory versions",
        url: "https://apps.legislature.ky.gov/law/statutes/chapter.aspx?id=39116",
      },
    ],
  },
  {
    region: "MD",
    lawName: "Maryland Online Data Privacy Act",
    citation: "Maryland Commercial Law sections 14-4701 to 14-4713",
    effectiveFrom: "2025-10-01T04:00:00.000Z",
    sourceUrl:
      "https://mgaleg.maryland.gov/mgawebsite/Laws/StatuteText?article=gcl&section=14-4705&enactments=false",
    sourceTitle: "Maryland General Assembly, Commercial Law section 14-4705",
    authority: "Maryland Attorney General",
    authorityUrl: "https://oag.maryland.gov/resources-info/Pages/data-privacy.aspx",
    scope:
      "Maryland consumers; 35,000 consumers or at least 10,000 and more than 20% sale revenue. Check the processing-period cutover and financial/data exceptions. Nonprofits are not generally exempt merely because they are nonprofits.",
    note: "Sensitive-data sale and collection have additional restrictions. This adult baseline does not collect sensitive categories or infer whether the recipient satisfies a particular exemption.",
    requests: STANDARD_REQUESTS,
    additionalSources: [
      {
        title: "Maryland Attorney General, data privacy guidance and applicability",
        url: "https://oag.maryland.gov/resources-info/Pages/data-privacy.aspx",
      },
    ],
  },
  {
    region: "MN",
    lawName: "Minnesota Consumer Data Privacy Act",
    citation: "Minnesota Statutes sections 325M.10 to 325M.21",
    effectiveFrom: "2025-07-31T05:00:00.000Z",
    sourceUrl: "https://www.revisor.mn.gov/statutes/cite/325M.14",
    sourceTitle: "Minnesota Revisor, section 325M.14, consumer rights",
    authority: "Minnesota Attorney General",
    authorityUrl: "https://ag.state.mn.us/Data-Privacy/Consumer/",
    scope:
      "Minnesota consumers; 100,000 consumers or at least 25,000 and more than 25% sale revenue. Review small-business and sector exemptions; certain postsecondary institutions have a later July 2029 date.",
    note: "Profiling explanation/challenge and third-party transparency have additional prerequisites. An appeal has a different response period from the initial 45-day request; the initial period is not reused for appeals.",
    requests: STANDARD_REQUESTS,
    additionalSources: [
      {
        title: "Minnesota applicability and exemptions",
        url: "https://www.revisor.mn.gov/statutes/cite/325M.12",
      },
    ],
  },
  {
    region: "MT",
    lawName: "Montana Consumer Data Privacy Act",
    citation: "Montana Code Annotated title 30, Chapter 14, Part 28",
    effectiveFrom: "2025-10-01T06:00:00.000Z",
    sourceUrl:
      "https://mca.legmt.gov/bills/mca/title_0300/chapter_0140/part_0280/section_0080/0300-0140-0280-0080.html",
    sourceTitle: "Montana Legislature, section 30-14-2808, consumer rights and response",
    authority: "Montana Department of Justice, Office of Consumer Protection",
    authorityUrl:
      "https://dojmt.gov/office-of-consumer-protection/montana-consumer-data-privacy/",
    scope:
      "The October 2025 amendments use 25,000 consumers or at least 15,000 and more than 25% sale revenue, excluding payment-only processing. Review the revised financial, nonprofit and other exemptions.",
    note: "Do not use the older 50,000/25,000 thresholds. Sale, targeted advertising and significant-decision profiling remain distinct from erasure and from the rights of children, which this product does not support.",
    requests: STANDARD_REQUESTS,
    additionalSources: [
      {
        title: "Montana DOJ, SB 297 and current applicability",
        url: "https://dojmt.gov/office-of-consumer-protection/montana-consumer-data-privacy/",
      },
    ],
  },
  {
    region: "NE",
    lawName: "Nebraska Data Privacy Act",
    citation: "Nebraska Revised Statutes sections 87-1101 to 87-1130",
    effectiveFrom: "2025-01-01T06:00:00.000Z",
    sourceUrl: "https://nebraskalegislature.gov/laws/laws-index/chap87-full.html",
    sourceTitle: "Nebraska Legislature, sections 87-1103 and 87-1107 to 87-1111",
    authority: "Nebraska Attorney General",
    authorityUrl: "https://ago.nebraska.gov/",
    scope:
      "Nebraska consumers and covered persons doing business in the state or providing consumed products/services. The general exemption follows the federal small-business definition rather than a universal consumer-count threshold; other entity/data exclusions apply.",
    note: "For other-source data, deletion compliance may instead retain only a suppression record or opt the person out of non-exempt processing. Ask which outcome occurred. Agent support is specifically scoped; household consent alone is not a universal legal power of attorney.",
    requests: STANDARD_REQUESTS,
    additionalSources: [
      {
        title: "Nebraska LB 1074, section 103, operative date",
        url: "https://www.nebraskalegislature.gov/FloorDocs/108/PDF/Slip/LB1074.pdf",
      },
    ],
  },
  {
    region: "NH",
    lawName: "New Hampshire consumer data privacy law",
    citation: "New Hampshire Revised Statutes Chapter 507-H",
    effectiveFrom: "2025-01-01T05:01:00.000Z",
    sourceUrl: "https://gc.nh.gov/rsa/html/LII/507-H/507-H-mrg.htm",
    sourceTitle: "New Hampshire General Court, Chapter 507-H",
    authority: "New Hampshire Attorney General",
    authorityUrl: "https://www.doj.nh.gov/",
    scope:
      "New Hampshire consumers; 35,000 consumers excluding payment-only processing, or at least 10,000 consumers and more than 25% sale revenue. Entity and data exemptions need review.",
    note: "Use the controller's published submission and appeal procedure. Publicly available information, protected data and legal exceptions can limit the response.",
    requests: STANDARD_REQUESTS,
  },
  {
    region: "NJ",
    lawName: "New Jersey Data Privacy Law",
    citation: "New Jersey Statutes sections 56:8-166.4 and following",
    effectiveFrom: "2025-01-15T05:00:00.000Z",
    sourceUrl: "https://pub.njleg.state.nj.us/Bills/2022/PL23/266_.HTM",
    sourceTitle: "New Jersey Legislature, P.L. 2023, Chapter 266",
    authority: "New Jersey Division of Consumer Affairs",
    authorityUrl:
      "https://www.njconsumeraffairs.gov/ocp/Pages/NJ-Data-Privacy-Law-FAQ.aspx",
    scope:
      "New Jersey consumers; 100,000 consumers excluding payment-only processing, or at least 25,000 consumers and sale revenue or a discount from sale. Do not import a percentage-of-revenue threshold from another state.",
    note: "Review sector/data exemptions and the June 2026 supplemental sensitive-data protections. Their staged provisions are not a reason to collect biometric, genetic or government-ID information in this instance.",
    requests: STANDARD_REQUESTS,
    additionalSources: [
      {
        title: "New Jersey Consumer Affairs, current law FAQ",
        url: "https://www.njconsumeraffairs.gov/ocp/Pages/NJ-Data-Privacy-Law-FAQ.aspx",
      },
      {
        title: "New Jersey P.L. 2026, Chapter 25, staged sensitive-data protections",
        url: "https://pub.njleg.state.nj.us/Bills/2026/PL26/25_.HTM",
      },
    ],
  },
  {
    region: "OR",
    lawName: "Oregon Consumer Privacy Act",
    citation: "Oregon Revised Statutes sections 646A.570 to 646A.589",
    effectiveFrom: "2024-07-01T07:00:00.000Z",
    sourceUrl: "https://www.oregonlegislature.gov/bills_laws/ors/ors646a.html",
    sourceTitle: "Oregon Legislature, sections 646A.574 and 646A.576",
    authority: "Oregon Attorney General",
    authorityUrl:
      "https://www.doj.state.or.us/consumer-protection/id-theft-data-breaches/privacy/privacy-law-faqs-for-consumers/",
    scope:
      "Oregon consumers; 100,000 consumers or at least 25,000 and more than 25% sale revenue. Nonprofit coverage began July 2025; specified motor-vehicle manufacturers and affiliates have separate coverage. Other data/entity exemptions need review.",
    note: "Consumer rights do not generally cover employment or job-application records. Third-party transparency and profiling conditions need individual review; this baseline never asserts total removal of public records.",
    requests: STANDARD_REQUESTS,
    additionalSources: [
      {
        title: "Oregon DOJ, current applicability and amendments",
        url: "https://www.doj.state.or.us/consumer-protection/for-businesses/privacy-law-faqs-for-businesses/",
      },
    ],
  },
  {
    region: "RI",
    lawName: "Rhode Island Data Transparency and Privacy Protection Act",
    citation: "Rhode Island General Laws Chapter 6-48.1",
    effectiveFrom: "2026-01-01T05:00:00.000Z",
    sourceUrl: "https://webserver.rilegislature.gov/Statutes/TITLE6/6-48.1/6-48.1-5.htm",
    sourceTitle: "Rhode Island Legislature, sections 6-48.1-5 and 6-48.1-6",
    authority: "Rhode Island Attorney General",
    authorityUrl: "https://riag.ri.gov/",
    scope:
      "Covered for-profit controllers; 35,000 consumers excluding payment-only processing, or at least 10,000 and more than 20% sale revenue. Statutory consumer, entity and data exclusions apply.",
    note: "Separate website privacy-disclosure duties have broader reach than the consumer-rights threshold. A website notice alone does not prove statutory deletion applies to that business.",
    requests: STANDARD_REQUESTS,
    additionalSources: [
      {
        title: "Rhode Island scope and response procedure",
        url: "https://webserver.rilegislature.gov/Statutes/TITLE6/6-48.1/6-48.1-6.htm",
      },
    ],
  },
  {
    region: "TN",
    lawName: "Tennessee Information Protection Act",
    citation: "Tennessee Code title 47, Chapter 18, Part 33",
    effectiveFrom: "2025-07-01T05:00:00.000Z",
    sourceUrl:
      "https://wapp.capitol.tn.gov/apps/BillInfo/Default?BillNumber=SB0073&GA=113",
    sourceTitle: "Tennessee General Assembly, SB 73, enacted Public Chapter 408",
    authority: "Tennessee Attorney General",
    authorityUrl: "https://www.tn.gov/attorneygeneral.html",
    scope:
      "Covered controllers exceed $25 million revenue and meet either the 175,000-consumer threshold or the 25,000-consumer and more-than-50%-sale-revenue alternative. Entity/data exemptions apply.",
    note: "Use the enacted chapter, not an earlier bill's different numbers. Other-source deletion may have alternative compliance measures; a qualifying privacy programme may provide a statutory defence. Ask what the controller actually did.",
    requests: STANDARD_REQUESTS,
  },
  {
    region: "TX",
    lawName: "Texas Data Privacy and Security Act",
    citation: "Texas Business and Commerce Code Chapter 541",
    effectiveFrom: "2024-07-01T05:00:00.000Z",
    sourceUrl: "https://statutes.capitol.texas.gov/Docs/BC/htm/BC.541.htm",
    sourceTitle: "Texas Legislature, Business and Commerce Code Chapter 541",
    authority: "Texas Attorney General",
    authorityUrl:
      "https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights/texas-data-privacy-and-security-act",
    scope:
      "Texas consumers and covered controllers; general small-business exemption follows federal criteria rather than a universal consumer-count/revenue threshold. Sensitive-data sale provisions and other entity/data exemptions need review.",
    note: "For data obtained from elsewhere, permitted suppression or processing opt-out can satisfy a deletion request in specified cases. Confirm the actual result rather than equating that result with erasure.",
    requests: STANDARD_REQUESTS,
    additionalSources: [
      {
        title: "Texas Attorney General, TDPSA consumer rights",
        url: "https://www.texasattorneygeneral.gov/consumer-protection/file-consumer-complaint/consumer-privacy-rights/texas-data-privacy-and-security-act",
      },
    ],
  },
  {
    region: "UT",
    lawName: "Utah Consumer Privacy Act",
    citation: "Utah Code title 13, Chapter 61",
    effectiveFrom: "2026-07-01T06:00:00.000Z",
    sourceUrl: "https://le.utah.gov/xcode/Title13/Chapter61/C13-61_2022050420231231.pdf",
    sourceTitle: "Utah Legislature, current and scheduled Chapter 61",
    authority: "Utah Division of Consumer Protection",
    authorityUrl: "https://dcp.utah.gov/",
    scope:
      "Utah consumers; at least $25 million annual revenue and either 100,000 consumers or at least 25,000 and more than 50% sale revenue, subject to entity/data exemptions.",
    note: "Correction became effective July 1, 2026 under HB 418. Deletion covers data provided by the consumer; opt-out covers sale and targeted advertising, not a general profiling opt-out.",
    requests: {
      ACCESS,
      CORRECTION,
      DELETION: PROVIDED_DELETION,
      OPT_OUT:
        "Apply the named person's opt-out of sale and targeted-advertising processing under Utah law. Confirm the choices applied. This request does not assert a general profiling opt-out right.",
    },
    additionalSources: [
      {
        title: "Utah HB 418, enacted correction right and effective date",
        url: "https://le.utah.gov/~2025/bills/hbillenr/HB0418.pdf",
      },
    ],
    future: [
      {
        effectiveFrom: "2027-01-01T07:00:00.000Z",
        sourceUrl:
          "https://le.utah.gov/xcode/Title13/Chapter61/C13-61_2022050420231231.pdf",
        scope:
          "The January 2027 provisions additionally cover specified motor-vehicle manufacturers collecting vehicle data, independently of the ordinary revenue/consumer thresholds. The ordinary thresholds and exemptions still require review for other controllers.",
        note: "Chapter 193, 2026 General Session adds motor-vehicle coverage and separate vehicle-data provisions. The initial response policy and the provided-data deletion limit are preserved; no vehicle identifiers are collected by default.",
      },
    ],
  },
  {
    region: "VA",
    lawName: "Virginia Consumer Data Protection Act",
    citation: "Virginia Code sections 59.1-575 to 59.1-585",
    effectiveFrom: "2023-01-01T05:00:00.000Z",
    sourceUrl: "https://law.lis.virginia.gov/vacodefull/title59.1/chapter53/",
    sourceTitle: "Virginia Legislative Information System, Chapter 53, section 59.1-577",
    authority: "Virginia Attorney General",
    authorityUrl: "https://www.oag.state.va.us/consumer-protection/",
    scope:
      "Virginia consumers acting in an individual or household context; 100,000 consumers or at least 25,000 and more than 50% sale revenue. Review financial, HIPAA, nonprofit, higher-education and other exemptions.",
    note: "Deletion of third-party-sourced data may use a minimal suppression record or opt-out of non-exempt processing as specified by law. Do not report these alternatives as proof that all data was erased.",
    requests: STANDARD_REQUESTS,
  },
];

export function usPackName(pack: UsPrivacyPack): string {
  return US_STATES[pack.region];
}
