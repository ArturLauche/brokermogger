/**
 * Legal rules and their published version 1 for every seeded jurisdiction.
 *
 * Pure data: no database access, only enum types from @prisma/client.
 *
 * Honesty rules that this file follows and that reviewers must keep:
 *  * A right is only listed when the cited law clearly provides it. Australia
 *    and Singapore therefore have no deletion right, and the United States
 *    outside California has no assumed federal deletion right.
 *  * Every version carries a source URL, a source title, a review date and a
 *    confidence value. Nothing here was reviewed by a lawyer.
 *  * LOW confidence always implies `requiresLegalReview`. The database enforces
 *    this too (`legal_rule_version_low_confidence_requires_review`).
 */
import type { LegalConfidence, PublicationStatus, RequestType } from "@prisma/client";
import type { DeadlinePolicy } from "@/lib/jurisdiction/deadlines";
import { createGdprPacks } from "./gdpr-packs";
import {
  GDPR_RESPONSE_POLICY,
  UK_GDPR_RESPONSE_POLICY,
  CCPA_RESPONSE_POLICY,
  CCPA_OPT_OUT_POLICY,
} from "./deadline-policies";

/**
 * Structured deadline logic. Stored as JSON on `LegalRuleVersion.deadlineRule`.
 * Declared as a type alias, not an interface, so that Prisma accepts it as a
 * JSON input value.
 */
export type DeadlineRuleSeed = {
  /** Explicit executable policy; legacy baseDays is retained only for compatibility. */
  policy?: DeadlinePolicy;
  /** Baseline number of days, null when the law sets no fixed period. */
  baseDays: number | null;
  dayType: "CALENDAR" | "BUSINESS";
  /** Event the clock starts from, in plain language. */
  startsFrom: string;
  extension: {
    possible: boolean;
    additionalDays: number | null;
    maxTotalDays: number | null;
    noticeRequired: boolean;
    conditions: string[];
  };
  conditions: string[];
  /** False whenever the maintainers could not confirm the timing from a primary source. */
  verified: boolean;
  notes: string;
};

/** Stored as JSON on `LegalRuleVersion.verificationRequirements`. */
export type LegalVerificationRequirementsSeed = {
  identityVerificationExpected: boolean;
  governmentIdExpected: boolean;
  accountRequired: boolean;
  /** Null where the law is silent or the maintainers could not confirm it. */
  authorisedAgentSupported: boolean | null;
  notarisationExpected: boolean;
  dataMinimisationNote: string;
};

export type AdditionalSourceSeed = {
  title: string;
  url: string;
};

export interface LegalRuleVersionSeed {
  version: number;
  status: PublicationStatus;
  supportedRequestTypes: RequestType[];
  /** Reads naturally after "under ..." inside a letter. */
  legalBasisText: string;
  deadlineDays: number | null;
  deadlineRule: DeadlineRuleSeed;
  verificationRequirements: LegalVerificationRequirementsSeed;
  escalationPath: string;
  escalationAuthority?: string;
  escalationUrl?: string;
  /** Clause keys from `prisma/seeds/data/clauses.ts`. */
  templateClauses: string[];
  riskNotes: string;
  requiresLegalReview: boolean;
  confidence: LegalConfidence;
  sourceUrl: string;
  sourceTitle: string;
  additionalSources: AdditionalSourceSeed[];
  /** ISO timestamp. */
  lastReviewedAt: string;
  reviewedBy: string;
  /** ISO timestamp. */
  effectiveFrom: string;
  changeNotes: string;
}

export interface LegalRuleSeed {
  jurisdictionCode: string;
  /** Stable key within the jurisdiction. */
  key: string;
  lawName: string;
  shortName: string;
  description: string;
  isActive: boolean;
  versions: LegalRuleVersionSeed[];
}

const REVIEWED_BY = "Brokermogger maintainers, unreviewed by counsel";
const LAST_REVIEWED_AT = "2026-08-01T00:00:00.000Z";
const INITIAL_CHANGE_NOTES = "Initial demo rule shipped with the seed data set.";

const NO_IDENTITY_DOCUMENT_NOTE =
  "Ask for the least intrusive verification that identifies the record. Government identity documents, dates of birth and financial data are not provided by default.";

const BASE_LEGAL_RULES: readonly LegalRuleSeed[] = [
  // -------------------------------------------------------------------------
  // California
  // -------------------------------------------------------------------------
  {
    jurisdictionCode: "US-CA",
    key: "ccpa-consumer-rights",
    lawName:
      "California Consumer Privacy Act as amended by the California Privacy Rights Act",
    shortName: "CCPA/CPRA consumer rights",
    description:
      "Access, deletion and correction of personal information held by a business about a California resident.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "DELETION",
          "ACCESS",
          "CORRECTION",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "the California Consumer Privacy Act as amended by the California Privacy Rights Act (California Civil Code sections 1798.100 and following), which gives California residents the right to know about, delete and correct personal information a business holds about them",
        deadlineDays: 45,
        deadlineRule: {
          policy: CCPA_RESPONSE_POLICY,
          baseDays: 45,
          dayType: "CALENDAR",
          startsFrom: "receipt of a verifiable consumer request",
          extension: {
            possible: true,
            additionalDays: 45,
            maxTotalDays: 90,
            noticeRequired: true,
            conditions: [
              "The business must inform the consumer of the extension and the reason for it within the first 45 days.",
            ],
          },
          conditions: [
            "The business may first take steps to verify that the request comes from the consumer or an authorised agent.",
            "Statutory or other legal retention grounds can narrow what is actually deleted.",
          ],
          verified: true,
          notes:
            "45 calendar days with one 45 day extension is the widely published baseline. Confirm against the current statute and regulations before production use.",
        },
        verificationRequirements: {
          identityVerificationExpected: true,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: true,
          notarisationExpected: false,
          dataMinimisationNote: NO_IDENTITY_DOCUMENT_NOTE,
        },
        escalationPath:
          "If the business does not respond in time or refuses without explanation, the individual can report the business to the California Attorney General or to the California Privacy Protection Agency. Brokermogger never files a complaint by itself; the individual decides whether to escalate.",
        escalationAuthority: "California Privacy Protection Agency",
        escalationUrl: "https://cppa.ca.gov/",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "scope-limitation",
          "verification-minimisation",
          "retention-exception-disclosure",
          "third-party-disclosure-list",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "Applies only to businesses that meet the statutory thresholds and to consumers who are California residents. Exemptions apply, for example to certain information covered by other federal or state laws, so a refusal is not automatically unlawful. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "LOW",
        sourceUrl: "https://oag.ca.gov/privacy/ccpa",
        sourceTitle:
          "California Attorney General, California Consumer Privacy Act (CCPA)",
        additionalSources: [
          {
            title: "California Privacy Protection Agency",
            url: "https://cppa.ca.gov/",
          },
        ],
        lastReviewedAt: "2026-09-30T00:00:00.000Z",
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2023-01-01T00:00:00.000Z",
        changeNotes:
          "Source timing review on 2026-09-30. Versioned receipt-based response policy; dispatch and unverified holiday calendars remain estimates.",
      },
    ],
  },
  {
    jurisdictionCode: "US-CA",
    key: "ccpa-opt-out-sale-sharing",
    lawName:
      "California Consumer Privacy Act as amended by the California Privacy Rights Act",
    shortName: "CCPA/CPRA opt out of sale or sharing",
    description:
      "Direction to a business to stop selling or sharing personal information about a California resident.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: ["OPT_OUT", "FOLLOW_UP", "FINAL_REMINDER", "ESCALATION"],
        legalBasisText:
          "the right to opt out of the sale or sharing of personal information under the California Consumer Privacy Act as amended by the California Privacy Rights Act (California Civil Code section 1798.120)",
        deadlineDays: 15,
        deadlineRule: {
          policy: CCPA_OPT_OUT_POLICY,
          baseDays: 15,
          dayType: "BUSINESS",
          startsFrom: "receipt of the opt out request",
          extension: {
            possible: false,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: false,
            conditions: [],
          },
          conditions: [
            "An opt out request does not have to be verified in the same way as a deletion request.",
            "The business is expected to forward the opt out to third parties it sold or shared the data with.",
          ],
          verified: true,
          notes:
            "The 15 business day period comes from the CCPA regulations rather than the statute text. Confirm the current regulation before relying on it.",
        },
        verificationRequirements: {
          identityVerificationExpected: false,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: true,
          notarisationExpected: false,
          dataMinimisationNote:
            "An opt out should not require an account or an identity document. Provide only the identifiers needed to find the record.",
        },
        escalationPath:
          "If sale or sharing continues, the individual can report the business to the California Attorney General or to the California Privacy Protection Agency. The individual decides whether to escalate.",
        escalationAuthority: "California Privacy Protection Agency",
        escalationUrl: "https://cppa.ca.gov/",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "opt-out-sale-sharing",
          "scope-limitation",
          "verification-minimisation",
          "third-party-disclosure-list",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "An opt out stops sale and sharing going forward. It is not a deletion and does not remove an existing public listing. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "LOW",
        sourceUrl: "https://oag.ca.gov/privacy/ccpa",
        sourceTitle:
          "California Attorney General, California Consumer Privacy Act (CCPA)",
        additionalSources: [
          {
            title: "California Privacy Protection Agency regulations",
            url: "https://cppa.ca.gov/regulations/",
          },
        ],
        lastReviewedAt: "2026-09-30T00:00:00.000Z",
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2023-01-01T00:00:00.000Z",
        changeNotes:
          "Source timing review on 2026-09-30. Versioned receipt-based response policy; dispatch and unverified holiday calendars remain estimates.",
      },
    ],
  },
  {
    jurisdictionCode: "US-CA",
    key: "ca-delete-act-drop",
    lawName:
      "California Delete Act (Senate Bill 362) and the Delete Request and Opt-out Platform",
    shortName: "California Delete Act / DROP",
    description:
      "Deletion route for registered California data brokers through the state deletion request platform.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "DELETION",
          "SUPPRESSION",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "the California Delete Act (California Civil Code sections 1798.99.80 and following), under which registered data brokers must process deletion requests received through the deletion request platform operated by the California Privacy Protection Agency",
        deadlineDays: 45,
        deadlineRule: {
          baseDays: 45,
          dayType: "CALENDAR",
          startsFrom:
            "the point at which a registered broker is required to access the platform, which the maintainers did not verify",
          extension: {
            possible: false,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: false,
            conditions: [],
          },
          conditions: [
            "Only data brokers that are registered in California are in scope.",
            "The obligation and its start date depend on the current status of the platform and of the implementing regulations.",
          ],
          verified: false,
          notes:
            "The 45 day figure reflects the maintainers' reading of the statute and is explicitly unverified. Check the current CPPA guidance before using this rule in production.",
        },
        verificationRequirements: {
          identityVerificationExpected: true,
          governmentIdExpected: false,
          accountRequired: true,
          authorisedAgentSupported: null,
          notarisationExpected: false,
          dataMinimisationNote:
            "Requests run through the state platform, so the platform decides which identifiers are handed over. Brokermogger does not submit to the platform automatically.",
        },
        escalationPath:
          "Non-compliance by a registered broker can be reported to the California Privacy Protection Agency. The individual decides whether to escalate, and submission through the state platform is a step the individual performs.",
        escalationAuthority: "California Privacy Protection Agency",
        escalationUrl: "https://cppa.ca.gov/",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "delete-act-platform-reference",
          "scope-limitation",
          "verification-minimisation",
          "retention-exception-disclosure",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "Timing, eligibility, broker coverage and the behaviour of the official platform must be verified against current California Privacy Protection Agency sources before production use. Brokermogger does not operate, integrate with or speak for the state platform, and a broker that is not registered in California is very likely out of scope.",
        requiresLegalReview: true,
        confidence: "LOW",
        sourceUrl: "https://cppa.ca.gov/data_broker_registry/",
        sourceTitle: "California Privacy Protection Agency, data broker registry",
        additionalSources: [
          {
            title: "California Attorney General, data broker information",
            url: "https://oag.ca.gov/data-brokers",
          },
        ],
        lastReviewedAt: LAST_REVIEWED_AT,
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2024-01-01T00:00:00.000Z",
        changeNotes:
          "Initial demo rule. Deliberately conservative: unverified timing and unverified platform behaviour.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Other United States
  // -------------------------------------------------------------------------
  {
    jurisdictionCode: "US-OTHER",
    key: "us-state-privacy-rights",
    lawName: "State consumer privacy law of the individual's state of residence",
    shortName: "US state privacy rights",
    description:
      "Deletion, access, correction and opt out rights that several US states provide. The applicable state law has to be confirmed per request.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "DELETION",
          "ACCESS",
          "CORRECTION",
          "OPT_OUT",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "the consumer privacy law of my state of residence, as several US states give residents rights to access, correct and delete personal data and to opt out of targeted advertising and the sale of personal data",
        deadlineDays: 45,
        deadlineRule: {
          baseDays: 45,
          dayType: "CALENDAR",
          startsFrom: "receipt of the request",
          extension: {
            possible: true,
            additionalDays: 45,
            maxTotalDays: 90,
            noticeRequired: true,
            conditions: [
              "Most state laws that use a 45 day period allow one extension where the request is complex, with notice to the consumer.",
            ],
          },
          conditions: [
            "The applicable state law must be confirmed. Deadlines, thresholds and available rights differ between states.",
            "Several states have no general consumer privacy statute at all.",
          ],
          verified: false,
          notes:
            "45 days is the most common period among the state statutes the maintainers looked at. It is a working assumption, not a confirmed rule for any specific state.",
        },
        verificationRequirements: {
          identityVerificationExpected: true,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: null,
          notarisationExpected: false,
          dataMinimisationNote: NO_IDENTITY_DOCUMENT_NOTE,
        },
        escalationPath:
          "Where the state provides an enforcement route, a complaint usually goes to the state attorney general. The individual has to identify the correct office and decide whether to escalate.",
        escalationAuthority:
          "State attorney general of the individual's state of residence",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "scope-limitation",
          "verification-minimisation",
          "retention-exception-disclosure",
          "third-party-disclosure-list",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "There is no uniform federal deletion right in the United States. Whether any right exists at all depends on the state of residence, on whether the recipient meets that state's applicability thresholds and on sector exemptions. Confirm the applicable state law before sending. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "LOW",
        sourceUrl: "https://www.ftc.gov/business-guidance/privacy-security",
        sourceTitle: "US Federal Trade Commission, privacy and security guidance",
        additionalSources: [
          {
            title: "National Conference of State Legislatures, state privacy legislation",
            url: "https://www.ncsl.org/technology-and-communication/state-laws-related-to-digital-privacy",
          },
        ],
        lastReviewedAt: LAST_REVIEWED_AT,
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2023-01-01T00:00:00.000Z",
        changeNotes:
          "Initial demo rule. Deliberately generic because the applicable state law is unknown at seed time.",
      },
    ],
  },
  {
    jurisdictionCode: "US-OTHER",
    key: "us-broker-voluntary-opt-out",
    lawName: "Voluntary broker opt out and suppression policy",
    shortName: "Voluntary opt out / suppression",
    description:
      "Route for the case where no statutory deletion right clearly applies and the request relies on the recipient's own opt out policy.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: ["OPT_OUT", "SUPPRESSION", "FOLLOW_UP", "FINAL_REMINDER"],
        legalBasisText:
          "your published opt out and suppression policy, as this request does not rely on a statutory right",
        deadlineDays: null,
        deadlineRule: {
          baseDays: null,
          dayType: "CALENDAR",
          startsFrom: "receipt of the request",
          extension: {
            possible: false,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: false,
            conditions: [],
          },
          conditions: [
            "There is no statutory deadline. Brokermogger schedules a courtesy follow up after 30 days instead.",
          ],
          verified: true,
          notes:
            "No deadline is claimed because none exists. Any date in the letter is a polite request, not a legal demand.",
        },
        verificationRequirements: {
          identityVerificationExpected: false,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: null,
          notarisationExpected: false,
          dataMinimisationNote:
            "Provide the minimum identifiers needed to match the record. A voluntary request never justifies handing over an identity document.",
        },
        escalationPath:
          "There is no guaranteed regulator route for a voluntary request. If the recipient ignores it, the individual can check whether a state privacy law applies after all, or contact the relevant state attorney general. The individual decides.",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "opt-out-sale-sharing",
          "scope-limitation",
          "verification-minimisation",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "This rule claims no legal right at all. It exists so that the product stays honest when a statutory basis cannot be established: the recipient may refuse and that refusal is lawful. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "LOW",
        sourceUrl: "https://www.ftc.gov/business-guidance/privacy-security",
        sourceTitle: "US Federal Trade Commission, privacy and security guidance",
        additionalSources: [],
        lastReviewedAt: LAST_REVIEWED_AT,
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2023-01-01T00:00:00.000Z",
        changeNotes: INITIAL_CHANGE_NOTES,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Germany (EU GDPR)
  // -------------------------------------------------------------------------
  {
    jurisdictionCode: "DE",
    key: "gdpr-access-rectification-erasure",
    lawName: "Regulation (EU) 2016/679 (General Data Protection Regulation)",
    shortName: "GDPR access, rectification, erasure",
    description:
      "Rights of access (Article 15), rectification (Article 16) and erasure (Article 17) against a controller.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "ACCESS",
          "CORRECTION",
          "DELETION",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "Articles 15, 16 and 17 of Regulation (EU) 2016/679 (General Data Protection Regulation), which give a data subject the right to obtain access to their personal data, to have inaccurate data rectified and to obtain erasure where one of the grounds in Article 17(1) applies",
        deadlineDays: null,
        deadlineRule: {
          policy: GDPR_RESPONSE_POLICY,
          baseDays: null,
          dayType: "CALENDAR",
          startsFrom: "receipt of the request",
          extension: {
            possible: true,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: true,
            conditions: [
              "Article 12(3) allows two further months where the request is complex or where the controller received a number of requests.",
              "The controller must inform the data subject of the extension and the reasons within one month of receipt.",
            ],
          },
          conditions: [
            "The baseline response period is one calendar month from receipt, not a fixed day count.",
            "Erasure can be refused where Article 17(3) applies, for example where processing is necessary for compliance with a legal obligation.",
          ],
          verified: true,
          notes:
            "One calendar month, with a possible two-month extension under Article 12(3). Extensions are not automatic.",
        },
        verificationRequirements: {
          identityVerificationExpected: true,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: true,
          notarisationExpected: false,
          dataMinimisationNote:
            "Article 12(6) allows a controller to ask for additional information only where it has reasonable doubts about identity. A copy of an identity document is not a default requirement.",
        },
        escalationPath:
          "If the controller does not respond within the period or refuses without an adequate reason, the data subject can lodge a complaint with the competent supervisory authority under Article 77, usually the authority of their habitual residence. In Germany this is the state data protection authority responsible for the controller. The individual decides whether to escalate.",
        escalationAuthority: "Competent data protection supervisory authority",
        escalationUrl: "https://www.edpb.europa.eu/about-edpb/our-members_en",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "scope-limitation",
          "verification-minimisation",
          "retention-exception-disclosure",
          "third-party-disclosure-list",
          "restriction-of-processing",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "The rights are clear in the regulation, but their application to a specific recipient is not. Erasure has exceptions under Article 17(3), a controller may charge or refuse for manifestly unfounded or excessive requests under Article 12(5), and whether the recipient is a controller at all has to be assessed. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "MEDIUM",
        sourceUrl: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
        sourceTitle:
          "EUR-Lex, Regulation (EU) 2016/679 (General Data Protection Regulation), consolidated text",
        additionalSources: [
          {
            title: "European Data Protection Board, members and national authorities",
            url: "https://www.edpb.europa.eu/about-edpb/our-members_en",
          },
        ],
        lastReviewedAt: "2026-09-30T00:00:00.000Z",
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2018-05-25T00:00:00.000Z",
        changeNotes:
          "Source timing review on 2026-09-30. Versioned receipt-based response policy; dispatch and unverified holiday calendars remain estimates.",
      },
    ],
  },
  {
    jurisdictionCode: "DE",
    key: "gdpr-objection-and-consent-withdrawal",
    lawName: "Regulation (EU) 2016/679 (General Data Protection Regulation)",
    shortName: "GDPR objection and consent withdrawal",
    description:
      "Objection under Article 21, restriction under Article 18 and withdrawal of consent under Article 7(3).",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "OBJECTION",
          "CONSENT_WITHDRAWAL",
          "OPT_OUT",
          "SUPPRESSION",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "Article 21 of Regulation (EU) 2016/679, under which a data subject may object to processing based on legitimate interests and may object to direct marketing at any time, and Article 7(3), under which consent may be withdrawn at any time",
        deadlineDays: null,
        deadlineRule: {
          policy: GDPR_RESPONSE_POLICY,
          baseDays: null,
          dayType: "CALENDAR",
          startsFrom: "receipt of the objection or withdrawal",
          extension: {
            possible: true,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: true,
            conditions: [
              "Article 12(3) allows two further months for complex requests, with notice within the first month.",
            ],
          },
          conditions: [
            "An objection to direct marketing under Article 21(2) has to be followed without a balancing test.",
            "For other processing the controller may continue where it demonstrates compelling legitimate grounds under Article 21(1).",
          ],
          verified: true,
          notes:
            "The response period follows Article 12(3). Marketing objections should be actioned without delay.",
        },
        verificationRequirements: {
          identityVerificationExpected: true,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: true,
          notarisationExpected: false,
          dataMinimisationNote:
            "An objection to direct marketing should not require an identity document or an account.",
        },
        escalationPath:
          "A complaint can be lodged with the competent supervisory authority under Article 77. The individual decides whether to escalate.",
        escalationAuthority: "Competent data protection supervisory authority",
        escalationUrl: "https://www.edpb.europa.eu/about-edpb/our-members_en",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "direct-marketing-objection",
          "consent-withdrawal",
          "restriction-of-processing",
          "scope-limitation",
          "verification-minimisation",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "Withdrawing consent does not make earlier processing unlawful and does not by itself delete data. An objection outside direct marketing can be refused where the controller demonstrates compelling legitimate grounds. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "MEDIUM",
        sourceUrl: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
        sourceTitle:
          "EUR-Lex, Regulation (EU) 2016/679 (General Data Protection Regulation), consolidated text",
        additionalSources: [
          {
            title: "European Data Protection Board, members and national authorities",
            url: "https://www.edpb.europa.eu/about-edpb/our-members_en",
          },
        ],
        lastReviewedAt: "2026-09-30T00:00:00.000Z",
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2018-05-25T00:00:00.000Z",
        changeNotes:
          "Source timing review on 2026-09-30. Versioned receipt-based response policy; dispatch and unverified holiday calendars remain estimates.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // United Kingdom
  // -------------------------------------------------------------------------
  {
    jurisdictionCode: "GB",
    key: "uk-gdpr-access-rectification-erasure",
    lawName: "UK General Data Protection Regulation and Data Protection Act 2018",
    shortName: "UK GDPR access, rectification, erasure",
    description:
      "Rights of access, rectification and erasure for individuals in the United Kingdom.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "ACCESS",
          "CORRECTION",
          "DELETION",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "Articles 15, 16 and 17 of the UK General Data Protection Regulation, read with the Data Protection Act 2018, which give an individual the right of access to their personal data, the right to have inaccurate data rectified and the right to erasure where one of the grounds in Article 17(1) applies",
        deadlineDays: null,
        deadlineRule: {
          policy: UK_GDPR_RESPONSE_POLICY,
          baseDays: null,
          dayType: "CALENDAR",
          startsFrom: "receipt of the request",
          extension: {
            possible: true,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: true,
            conditions: [
              "The period can be extended by two further months for complex or numerous requests, with notice within the first month.",
            ],
          },
          conditions: [
            "The baseline response period is one calendar month from receipt, with bank holidays and justified pauses requiring review.",
            "Erasure can be refused where an exemption applies.",
          ],
          verified: true,
          notes:
            "One month plus up to two further months, as published by the Information Commissioner's Office.",
        },
        verificationRequirements: {
          identityVerificationExpected: true,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: true,
          notarisationExpected: false,
          dataMinimisationNote:
            "The controller may ask for information needed to confirm identity, but only where it has genuine doubts. A full identity document is not a default requirement.",
        },
        escalationPath:
          "If the organisation does not respond within one month or refuses without an adequate reason, the individual can complain to the Information Commissioner's Office. The Information Commissioner's Office expects the individual to raise the matter with the organisation first. The individual decides whether to escalate.",
        escalationAuthority: "Information Commissioner's Office",
        escalationUrl: "https://ico.org.uk/make-a-complaint/",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "scope-limitation",
          "verification-minimisation",
          "retention-exception-disclosure",
          "third-party-disclosure-list",
          "restriction-of-processing",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "Exemptions in the Data Protection Act 2018 can limit access and erasure, and a controller may refuse manifestly unfounded or excessive requests. Whether the recipient is a controller for the data in question has to be assessed per case. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "MEDIUM",
        sourceUrl:
          "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/",
        sourceTitle: "Information Commissioner's Office, individual rights guidance",
        additionalSources: [
          {
            title: "Data Protection Act 2018",
            url: "https://www.legislation.gov.uk/ukpga/2018/12/contents",
          },
        ],
        lastReviewedAt: "2026-09-30T00:00:00.000Z",
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2021-01-01T00:00:00.000Z",
        changeNotes:
          "Source timing review on 2026-09-30. Versioned receipt-based response policy; dispatch and unverified holiday calendars remain estimates.",
      },
    ],
  },
  {
    jurisdictionCode: "GB",
    key: "uk-gdpr-objection-and-restriction",
    lawName: "UK General Data Protection Regulation and Data Protection Act 2018",
    shortName: "UK GDPR objection and restriction",
    description:
      "Objection to processing, absolute objection to direct marketing and restriction of processing.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "OBJECTION",
          "SUPPRESSION",
          "OPT_OUT",
          "CONSENT_WITHDRAWAL",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "Article 21 of the UK General Data Protection Regulation, which allows an individual to object to processing carried out for legitimate interests and to object to direct marketing at any time, together with the right to restriction of processing in Article 18",
        deadlineDays: null,
        deadlineRule: {
          policy: UK_GDPR_RESPONSE_POLICY,
          baseDays: null,
          dayType: "CALENDAR",
          startsFrom: "receipt of the objection",
          extension: {
            possible: true,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: true,
            conditions: [
              "Two further months are available for complex or numerous requests, with notice within the first month.",
            ],
          },
          conditions: [
            "An objection to direct marketing is absolute and must be actioned.",
            "For other processing the organisation may continue where it demonstrates compelling legitimate grounds.",
          ],
          verified: true,
          notes: "Follows the same one month response period as other individual rights.",
        },
        verificationRequirements: {
          identityVerificationExpected: true,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: true,
          notarisationExpected: false,
          dataMinimisationNote:
            "A marketing objection should not require an account or an identity document.",
        },
        escalationPath:
          "A complaint can be made to the Information Commissioner's Office once the organisation has had the chance to respond. The individual decides whether to escalate.",
        escalationAuthority: "Information Commissioner's Office",
        escalationUrl: "https://ico.org.uk/make-a-complaint/",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "direct-marketing-objection",
          "restriction-of-processing",
          "consent-withdrawal",
          "scope-limitation",
          "verification-minimisation",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "Restriction is not deletion: the organisation may keep the data but must stop using it while the objection is assessed. Outside direct marketing an objection can be refused. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "MEDIUM",
        sourceUrl:
          "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/",
        sourceTitle: "Information Commissioner's Office, individual rights guidance",
        additionalSources: [
          {
            title: "Information Commissioner's Office, make a complaint",
            url: "https://ico.org.uk/make-a-complaint/",
          },
        ],
        lastReviewedAt: "2026-09-30T00:00:00.000Z",
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2021-01-01T00:00:00.000Z",
        changeNotes:
          "Source timing review on 2026-09-30. Versioned receipt-based response policy; dispatch and unverified holiday calendars remain estimates.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Brazil
  // -------------------------------------------------------------------------
  {
    jurisdictionCode: "BR",
    key: "lgpd-data-subject-rights",
    lawName: "Lei Geral de Protecao de Dados Pessoais (Lei 13.709/2018)",
    shortName: "LGPD data subject rights",
    description:
      "Confirmation of processing, access, correction and anonymisation, blocking or deletion of unnecessary or excessive data.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "ACCESS",
          "CORRECTION",
          "DELETION",
          "SUPPRESSION",
          "OBJECTION",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "Article 18 of the Lei Geral de Protecao de Dados Pessoais (Lei 13.709/2018), which gives a data subject the right to confirmation of processing, access to the data, correction of incomplete or outdated data and anonymisation, blocking or deletion of data that is unnecessary, excessive or processed unlawfully",
        deadlineDays: 15,
        deadlineRule: {
          baseDays: 15,
          dayType: "CALENDAR",
          startsFrom: "receipt of an express request from the data subject",
          extension: {
            possible: false,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: false,
            conditions: [],
          },
          conditions: [
            "Article 19 requires a complete declaration about the processing within 15 days; a simplified confirmation is due immediately.",
            "The 15 day period is expressed for access. Other rights in Article 18 do not carry the same explicit period.",
          ],
          verified: true,
          notes:
            "15 days follows Article 19(II) for the complete declaration. Applying it to every request type is a product simplification.",
        },
        verificationRequirements: {
          identityVerificationExpected: true,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: null,
          notarisationExpected: false,
          dataMinimisationNote:
            "The controller may confirm identity, but the request should not require an identity document by default.",
        },
        escalationPath:
          "A complaint can be filed with the Autoridade Nacional de Protecao de Dados. The individual decides whether to escalate.",
        escalationAuthority: "Autoridade Nacional de Protecao de Dados (ANPD)",
        escalationUrl: "https://www.gov.br/anpd/pt-br",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "anonymisation-or-blocking",
          "scope-limitation",
          "verification-minimisation",
          "retention-exception-disclosure",
          "third-party-disclosure-list",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "Deletion under Article 18(IV) is limited to data that is unnecessary, excessive or unlawfully processed. Article 16 allows retention for legal obligations, research and other listed purposes, so a full deletion cannot be promised. The Portuguese text of the law prevails over any English summary. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "LOW",
        sourceUrl:
          "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm",
        sourceTitle: "Presidencia da Republica, Lei 13.709/2018 (LGPD)",
        additionalSources: [
          {
            title: "Autoridade Nacional de Protecao de Dados",
            url: "https://www.gov.br/anpd/pt-br",
          },
        ],
        lastReviewedAt: LAST_REVIEWED_AT,
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2020-09-18T00:00:00.000Z",
        changeNotes: INITIAL_CHANGE_NOTES,
      },
    ],
  },
  {
    jurisdictionCode: "BR",
    key: "lgpd-consent-withdrawal",
    lawName: "Lei Geral de Protecao de Dados Pessoais (Lei 13.709/2018)",
    shortName: "LGPD consent withdrawal",
    description:
      "Withdrawal of consent where processing relies on consent, with a free and simplified procedure.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "CONSENT_WITHDRAWAL",
          "OPT_OUT",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "Article 8(5) and Article 18(IX) of the Lei Geral de Protecao de Dados Pessoais (Lei 13.709/2018), under which consent may be withdrawn at any time through a free and simplified procedure",
        deadlineDays: null,
        deadlineRule: {
          baseDays: null,
          dayType: "CALENDAR",
          startsFrom: "receipt of the withdrawal",
          extension: {
            possible: false,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: false,
            conditions: [],
          },
          conditions: [
            "The law requires a free and simplified withdrawal procedure but does not state a fixed number of days.",
            "Processing carried out before the withdrawal remains lawful.",
          ],
          verified: true,
          notes:
            "No deadline is claimed. Brokermogger schedules a courtesy follow up instead of asserting a statutory date.",
        },
        verificationRequirements: {
          identityVerificationExpected: false,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: null,
          notarisationExpected: false,
          dataMinimisationNote:
            "A withdrawal has to be as easy as giving consent, so it should not require an identity document.",
        },
        escalationPath:
          "A complaint can be filed with the Autoridade Nacional de Protecao de Dados. The individual decides whether to escalate.",
        escalationAuthority: "Autoridade Nacional de Protecao de Dados (ANPD)",
        escalationUrl: "https://www.gov.br/anpd/pt-br",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "consent-withdrawal",
          "direct-marketing-objection",
          "scope-limitation",
          "verification-minimisation",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "Withdrawing consent only affects processing that actually relies on consent. Where the controller relies on another legal basis in Article 7, the processing can continue. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "LOW",
        sourceUrl:
          "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm",
        sourceTitle: "Presidencia da Republica, Lei 13.709/2018 (LGPD)",
        additionalSources: [
          {
            title: "Autoridade Nacional de Protecao de Dados",
            url: "https://www.gov.br/anpd/pt-br",
          },
        ],
        lastReviewedAt: LAST_REVIEWED_AT,
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2020-09-18T00:00:00.000Z",
        changeNotes: INITIAL_CHANGE_NOTES,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // India
  // -------------------------------------------------------------------------
  {
    jurisdictionCode: "IN",
    key: "dpdp-data-principal-rights",
    lawName: "Digital Personal Data Protection Act 2023",
    shortName: "DPDP Act data principal rights",
    description:
      "Access to a summary of processing, correction, completion, updating and erasure, plus grievance redressal.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "ACCESS",
          "CORRECTION",
          "DELETION",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "sections 11 to 13 of the Digital Personal Data Protection Act 2023, which provide a data principal with the right to a summary of the personal data being processed, the right to correction, completion and updating, the right to erasure and the right to grievance redressal",
        deadlineDays: null,
        deadlineRule: {
          baseDays: null,
          dayType: "CALENDAR",
          startsFrom: "receipt of the request",
          extension: {
            possible: false,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: false,
            conditions: [],
          },
          conditions: [
            "The Act leaves response periods to the rules made under it, so no statutory number of days is claimed here.",
            "Commencement of the individual provisions has to be verified before a deadline is asserted.",
          ],
          verified: false,
          notes:
            "No deadline is claimed on purpose. Once the applicable rules are confirmed, a maintainer should publish version 2 with a verified period.",
        },
        verificationRequirements: {
          identityVerificationExpected: true,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: null,
          notarisationExpected: false,
          dataMinimisationNote:
            "Do not send a national identity number or an identity document. Provide contact identifiers only.",
        },
        escalationPath:
          "The Act routes complaints through the data fiduciary's grievance redressal mechanism first and then to the Data Protection Board of India. Availability depends on the commencement status of the relevant provisions. The individual decides whether to escalate.",
        escalationAuthority: "Data Protection Board of India",
        escalationUrl: "https://www.meity.gov.in/data-protection-framework",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "scope-limitation",
          "verification-minimisation",
          "retention-exception-disclosure",
          "confirmation-request",
          "escalation-notice",
          "household-consent-statement",
        ],
        riskNotes:
          "Commencement and rule making status of the Digital Personal Data Protection Act 2023 must be verified before this rule is used in production. Erasure can be refused where retention is necessary for a legal purpose, and the rights primarily bind data fiduciaries that processed the data with consent or for a legitimate use under the Act. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "LOW",
        sourceUrl: "https://www.meity.gov.in/data-protection-framework",
        sourceTitle:
          "Ministry of Electronics and Information Technology, data protection framework",
        additionalSources: [],
        lastReviewedAt: LAST_REVIEWED_AT,
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2023-08-11T00:00:00.000Z",
        changeNotes:
          "Initial demo rule. No deadline is asserted because the rules under the Act were not verified.",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Australia
  // -------------------------------------------------------------------------
  {
    jurisdictionCode: "AU",
    key: "privacy-act-access-correction",
    lawName: "Privacy Act 1988 and the Australian Privacy Principles",
    shortName: "Privacy Act access and correction",
    description:
      "Access under Australian Privacy Principle 12 and correction under Australian Privacy Principle 13.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "ACCESS",
          "CORRECTION",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "Australian Privacy Principles 12 and 13 under the Privacy Act 1988, which require an entity that holds personal information about an individual to give that individual access to it on request and to correct it where it is inaccurate, out of date, incomplete, irrelevant or misleading",
        deadlineDays: 30,
        deadlineRule: {
          baseDays: 30,
          dayType: "CALENDAR",
          startsFrom: "the request being made",
          extension: {
            possible: false,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: false,
            conditions: [],
          },
          conditions: [
            "Australian Privacy Principle 12.4 expects an organisation to respond within a reasonable period, which the Office of the Australian Information Commissioner treats as no more than 30 days.",
            "Access can be refused on the grounds listed in Australian Privacy Principle 12.3, and the refusal has to be explained in writing.",
          ],
          verified: true,
          notes:
            "30 days follows the regulator's published expectation for organisations rather than an explicit number in the Act.",
        },
        verificationRequirements: {
          identityVerificationExpected: true,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: null,
          notarisationExpected: false,
          dataMinimisationNote:
            "An entity may confirm identity before releasing data, but should not require more information than is needed to locate the record.",
        },
        escalationPath:
          "The individual complains to the entity first and can then complain to the Office of the Australian Information Commissioner, normally after 30 days without an adequate response. The individual decides whether to escalate.",
        escalationAuthority: "Office of the Australian Information Commissioner",
        escalationUrl: "https://www.oaic.gov.au/privacy/privacy-complaints",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "scope-limitation",
          "verification-minimisation",
          "third-party-disclosure-list",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "The Privacy Act 1988 does not give a general right to erasure, so this rule must never be used to demand deletion. Small business operators and several other categories fall outside the Act entirely, and Australian Privacy Principle 12.3 lists grounds for refusing access. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "LOW",
        sourceUrl:
          "https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-quick-reference",
        sourceTitle:
          "Office of the Australian Information Commissioner, Australian Privacy Principles quick reference",
        additionalSources: [
          {
            title:
              "Office of the Australian Information Commissioner, privacy complaints",
            url: "https://www.oaic.gov.au/privacy/privacy-complaints",
          },
        ],
        lastReviewedAt: LAST_REVIEWED_AT,
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2014-03-12T00:00:00.000Z",
        changeNotes:
          "Initial demo rule. Deliberately excludes deletion because the Privacy Act does not provide it.",
      },
    ],
  },
  {
    jurisdictionCode: "AU",
    key: "privacy-act-direct-marketing-opt-out",
    lawName: "Privacy Act 1988 and the Australian Privacy Principles",
    shortName: "Privacy Act direct marketing opt out",
    description:
      "Opt out of direct marketing and request for the source of the personal information under Australian Privacy Principle 7.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "OPT_OUT",
          "OBJECTION",
          "SUPPRESSION",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "Australian Privacy Principle 7 under the Privacy Act 1988, which allows an individual to ask an organisation not to use or disclose their personal information for direct marketing and to ask the organisation for the source of that information",
        deadlineDays: null,
        deadlineRule: {
          baseDays: null,
          dayType: "CALENDAR",
          startsFrom: "the request being made",
          extension: {
            possible: false,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: false,
            conditions: [],
          },
          conditions: [
            "Australian Privacy Principle 7.7 requires the organisation to give effect to the request within a reasonable period, without stating a number of days.",
            "The organisation must not charge for making or giving effect to the request.",
          ],
          verified: true,
          notes:
            "No fixed statutory period exists, so no deadline is claimed. A courtesy follow up is scheduled after 30 days.",
        },
        verificationRequirements: {
          identityVerificationExpected: false,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: null,
          notarisationExpected: false,
          dataMinimisationNote:
            "A marketing opt out should need nothing more than the contact details being marketed to.",
        },
        escalationPath:
          "If direct marketing continues, the individual can complain to the Office of the Australian Information Commissioner after giving the organisation a chance to respond. The individual decides whether to escalate.",
        escalationAuthority: "Office of the Australian Information Commissioner",
        escalationUrl: "https://www.oaic.gov.au/privacy/privacy-complaints",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "direct-marketing-objection",
          "scope-limitation",
          "verification-minimisation",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "An opt out stops marketing use, it does not delete the record and it does not remove the individual from an underlying database. The Privacy Act 1988 provides no general erasure right. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "LOW",
        sourceUrl:
          "https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-quick-reference",
        sourceTitle:
          "Office of the Australian Information Commissioner, Australian Privacy Principles quick reference",
        additionalSources: [
          {
            title:
              "Office of the Australian Information Commissioner, privacy complaints",
            url: "https://www.oaic.gov.au/privacy/privacy-complaints",
          },
        ],
        lastReviewedAt: LAST_REVIEWED_AT,
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2014-03-12T00:00:00.000Z",
        changeNotes: INITIAL_CHANGE_NOTES,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Singapore
  // -------------------------------------------------------------------------
  {
    jurisdictionCode: "SG",
    key: "pdpa-access-correction",
    lawName: "Personal Data Protection Act 2012",
    shortName: "PDPA access and correction",
    description:
      "Access to personal data and information about its use or disclosure, and correction of an error or omission.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "ACCESS",
          "CORRECTION",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "sections 21 and 22 of the Personal Data Protection Act 2012, under which an organisation must on request provide an individual with personal data about them that is in its possession or under its control, together with information about how it has been used or disclosed, and must correct an error or omission",
        deadlineDays: 30,
        deadlineRule: {
          baseDays: 30,
          dayType: "CALENDAR",
          startsFrom: "receipt of the request",
          extension: {
            possible: true,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: true,
            conditions: [
              "Where the organisation cannot respond within 30 days it has to tell the individual, within those 30 days, when it will respond.",
            ],
          },
          conditions: [
            "The Act requires a response as soon as reasonably possible; 30 days comes from the regulator's guidance rather than an explicit statutory period.",
            "Access can be refused or limited under the exceptions in the Fifth Schedule.",
          ],
          verified: false,
          notes:
            "The 30 day figure reflects published guidance from the Personal Data Protection Commission and should be re-checked against the current guidelines.",
        },
        verificationRequirements: {
          identityVerificationExpected: true,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: null,
          notarisationExpected: false,
          dataMinimisationNote:
            "Do not send a national identity number. The organisation should verify with the identifiers it already holds.",
        },
        escalationPath:
          "The individual raises the matter with the organisation first and can then bring a complaint to the Personal Data Protection Commission. The individual decides whether to escalate.",
        escalationAuthority: "Personal Data Protection Commission",
        escalationUrl: "https://www.pdpc.gov.sg/complaints-and-reviews",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "scope-limitation",
          "verification-minimisation",
          "third-party-disclosure-list",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "The Personal Data Protection Act 2012 does not provide a general right to be forgotten, so this rule must never be used to demand erasure. Access has statutory exceptions, and business contact information is largely outside the Act. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "LOW",
        sourceUrl:
          "https://www.pdpc.gov.sg/overview-of-pdpa/the-legislation/personal-data-protection-act",
        sourceTitle:
          "Personal Data Protection Commission Singapore, overview of the Personal Data Protection Act",
        additionalSources: [
          {
            title: "Personal Data Protection Commission, complaints and reviews",
            url: "https://www.pdpc.gov.sg/complaints-and-reviews",
          },
        ],
        lastReviewedAt: LAST_REVIEWED_AT,
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2014-07-02T00:00:00.000Z",
        changeNotes:
          "Initial demo rule. Deliberately excludes deletion because the Act does not provide a general erasure right.",
      },
    ],
  },
  {
    jurisdictionCode: "SG",
    key: "pdpa-withdraw-consent",
    lawName: "Personal Data Protection Act 2012",
    shortName: "PDPA withdrawal of consent",
    description:
      "Withdrawal of consent for the collection, use or disclosure of personal data, including marketing use.",
    isActive: true,
    versions: [
      {
        version: 1,
        status: "PUBLISHED",
        supportedRequestTypes: [
          "CONSENT_WITHDRAWAL",
          "OPT_OUT",
          "SUPPRESSION",
          "FOLLOW_UP",
          "FINAL_REMINDER",
          "ESCALATION",
        ],
        legalBasisText:
          "section 16 of the Personal Data Protection Act 2012, under which an individual may at any time withdraw consent for the collection, use or disclosure of their personal data by giving reasonable notice to the organisation",
        deadlineDays: null,
        deadlineRule: {
          baseDays: null,
          dayType: "CALENDAR",
          startsFrom: "the date reasonable notice of withdrawal is given",
          extension: {
            possible: false,
            additionalDays: null,
            maxTotalDays: null,
            noticeRequired: false,
            conditions: [],
          },
          conditions: [
            "The Act speaks of reasonable notice rather than a fixed number of days.",
            "The organisation must inform the individual of the likely consequences of the withdrawal, and it may keep data it is legally required to retain.",
          ],
          verified: true,
          notes:
            "No deadline is claimed. Brokermogger schedules a courtesy follow up instead of asserting a statutory date.",
        },
        verificationRequirements: {
          identityVerificationExpected: false,
          governmentIdExpected: false,
          accountRequired: false,
          authorisedAgentSupported: null,
          notarisationExpected: false,
          dataMinimisationNote:
            "A withdrawal of consent should not require an identity document or a national identity number.",
        },
        escalationPath:
          "If the organisation keeps using the data after the withdrawal takes effect, the individual can bring the matter to the Personal Data Protection Commission. The individual decides whether to escalate.",
        escalationAuthority: "Personal Data Protection Commission",
        escalationUrl: "https://www.pdpc.gov.sg/complaints-and-reviews",
        templateClauses: [
          "request-identification",
          "legal-basis",
          "identifier-list",
          "consent-withdrawal",
          "direct-marketing-objection",
          "scope-limitation",
          "verification-minimisation",
          "confirmation-request",
          "household-consent-statement",
        ],
        riskNotes:
          "Withdrawing consent stops future collection, use and disclosure that rely on consent. It is not deletion, and the organisation may retain data where the law requires or permits retention. Not reviewed by counsel.",
        requiresLegalReview: true,
        confidence: "LOW",
        sourceUrl:
          "https://www.pdpc.gov.sg/overview-of-pdpa/the-legislation/personal-data-protection-act",
        sourceTitle:
          "Personal Data Protection Commission Singapore, overview of the Personal Data Protection Act",
        additionalSources: [
          {
            title: "Personal Data Protection Commission, complaints and reviews",
            url: "https://www.pdpc.gov.sg/complaints-and-reviews",
          },
        ],
        lastReviewedAt: LAST_REVIEWED_AT,
        reviewedBy: REVIEWED_BY,
        effectiveFrom: "2014-07-02T00:00:00.000Z",
        changeNotes: INITIAL_CHANGE_NOTES,
      },
    ],
  },
];

/** Country packs share the reviewed GDPR definitions; historical German keys stay stable. */
export const LEGAL_RULES: readonly LegalRuleSeed[] = [
  ...BASE_LEGAL_RULES.filter((rule) => rule.jurisdictionCode !== "DE"),
  ...createGdprPacks(BASE_LEGAL_RULES.filter((rule) => rule.jurisdictionCode === "DE")),
];
