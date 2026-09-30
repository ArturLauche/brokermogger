/**
 * Request templates shipped with the demo data set.
 *
 * Pure data: no database access, only enum types from @prisma/client.
 *
 * Rules every body in this file follows:
 *  * Plain text only. No HTML, no markup, no emojis, no threats and no claim
 *    that removal is guaranteed.
 *  * Only placeholders from `lib/templates/variables.ts` in {{variable.name}}
 *    form. `requiredVariables` and `optionalVariables` together must list
 *    exactly the placeholders used in the subject and the body, which the unit
 *    tests verify.
 *  * Every body identifies the request type, states the legal basis, lists the
 *    approved identifiers, names a reply address, carries the reference code
 *    and asks the recipient to confirm what was actually done.
 */
import type { PublicationStatus, RequestChannel, RequestType } from "@prisma/client";
import {
  US_PRIVACY_PACKS,
  usPackName,
  type UsInitialRequestType,
} from "@/lib/jurisdiction/us";
import { FUTURE_US_PRIVACY_PACKS } from "@/lib/jurisdiction/futureUs";

export interface RequestTemplateVersionSeed {
  version: number;
  status: PublicationStatus;
  subjectTemplate: string;
  bodyTemplate: string;
  requiredVariables: string[];
  optionalVariables: string[];
  locale: string;
  changeNotes: string;
}

export interface RequestTemplateSeed {
  /** Globally unique key, `<scope>.<request type>`. */
  key: string;
  name: string;
  description: string;
  requestType: RequestType;
  channel: RequestChannel;
  /** Undefined for the generic template of a request type. */
  jurisdictionCode?: string;
  isActive: boolean;
  /** Clause keys from `prisma/seeds/data/clauses.ts` that the body implements. */
  clauses: string[];
  version: RequestTemplateVersionSeed;
}

/** Placeholders that every template in this file uses. */
const CORE_REQUIRED: readonly string[] = [
  "broker.name",
  "identifiers.list",
  "profile.country",
  "profile.fullName",
  "reply.address",
  "request.legalBasis",
  "request.reference",
  "request.type",
  "today",
];

/** Blocks that render empty when they do not apply. */
const CORE_OPTIONAL: readonly string[] = ["consent.statement"];

const CHANGE_NOTES =
  "2026-09-28: identify the named person consistently, remove empty response-date labels, and support reminders after partial replies.";

const CLAUSES_BASE = [
  "request-identification",
  "legal-basis",
  "identifier-list",
  "scope-limitation",
  "verification-minimisation",
  "confirmation-request",
  "household-consent-statement",
];

function version(
  subjectTemplate: string,
  bodyTemplate: string,
  options: { required?: string[]; optional?: string[] } = {}
): RequestTemplateVersionSeed {
  return {
    version: 1,
    status: "PUBLISHED",
    subjectTemplate,
    bodyTemplate,
    requiredVariables: [...CORE_REQUIRED, ...(options.required ?? [])].sort(),
    optionalVariables: [...CORE_OPTIONAL, ...(options.optional ?? [])].sort(),
    locale: "en",
    changeNotes: CHANGE_NOTES,
  };
}

const IDENTIFIER_BLOCK = `The request concerns {{profile.fullName}}, resident in {{profile.country}}. Please use the identifiers below only to locate matching records and for no other purpose.

{{identifiers.list}}

{{consent.statement}}`;

const VERIFICATION_BLOCK = `Please verify this request with the identifiers above. I do not provide identity documents, a date of birth or financial details unless you can explain why they are strictly necessary for this specific request.`;

function footer(): string {
  return `Reference: {{request.reference}}
Date of this request: {{today}}

{{profile.fullName}}`;
}

export const REQUEST_TEMPLATES: RequestTemplateSeed[] = [
  ...(["DELETION", "FOLLOW_UP", "FINAL_REMINDER"] as const).map((requestType) => ({
    key: `ca.drop.${requestType.toLowerCase().replaceAll("_", "-")}`,
    name: `California DROP ${requestType.toLowerCase().replaceAll("_", " ")} instructions`,
    description:
      "A private plan for the individual's action on the official DROP platform. No email, platform login or submission is automated.",
    requestType,
    channel: "DROP" as const,
    jurisdictionCode: "US-CA",
    isActive: true,
    clauses: [...CLAUSES_BASE, "delete-act-platform-reference", "scope-limitation"],
    version: {
      ...version(
        "California DROP {{request.type}} preparation — {{request.reference}}",
        `Private DROP preparation for {{profile.fullName}}, resident in {{profile.country}}.

Intended action: {{request.type}} concerning {{broker.name}}, under {{request.legalBasis}}.

This instance has not submitted a request or checked your DROP status. Complete California residency verification and any required identity fields directly on the official platform. Brokermogger does not collect its additional identity fields or log in on your behalf.

Approved matching details for your own review:
{{identifiers.list}}

{{consent.statement}}

Open https://consumer.drop.privacy.ca.gov/ yourself. Review the broker list and select the intended scope, including {{broker.name}}. The platform's default can include other current and future brokers; review those choices before submitting. For a follow-up, check your existing request's status rather than assuming another submission is required.

Keep your private DROP ID outside this instance. Do not share it in correspondence or upload an unredacted confirmation. Record only the submission date and relevant broker outcome here.

CalPrivacy describes initial status reporting of up to 90 days and ongoing broker rechecks at least every 45 days. These are different from a universal 45-day response deadline. Exceptions and nonmatching records can limit the outcome; no result is promised.

Your instance reply address is {{reply.address}}; it is not a destination for submitting to DROP. Record the actual platform outcome yourself.

${footer()}`
      ),
      changeNotes:
        "2026-09-30: separate official manual DROP actions from direct broker letters and from an invented ordinary response deadline.",
    },
  })),
  ...(
    [
      [
        "ACCESS",
        "Provide the summary of personal-data processing and recipient information covered by the applicable request basis. This does not assert full-copy access to every record.",
      ],
      [
        "CORRECTION",
        "Correct, complete or update the named person's inaccurate personal data within the applicable request basis. Please identify a secure channel for the disputed fields and proposed corrections.",
      ],
      [
        "DELETION",
        "Erase the named person's personal data to the extent covered by the applicable request basis and subject to lawful retention. Explain what you retain and why.",
      ],
    ] as const
  ).map(([requestType, instructions]) => ({
    key: `in.${requestType.toLowerCase()}`,
    name: `India ${requestType.toLowerCase()} request`,
    description:
      "Scoped Indian request; voluntary before DPDP rights commence and statutory only under the applicable published rule.",
    requestType,
    channel: "EMAIL" as const,
    jurisdictionCode: "IN",
    isActive: true,
    clauses: [...CLAUSES_BASE, "retention-exception-disclosure"],
    version: {
      ...version(
        "Privacy request ({{request.type}}) - reference {{request.reference}}",
        `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

${instructions}

Please use your published rights-request procedure where statutory rights apply. Where this is a voluntary policy request, I understand that you may decline. This letter asserts no fixed response deadline or automatic remedy.

${VERIFICATION_BLOCK}

Please reply to {{reply.address}}, confirm the actual result and explain any refusal and available grievance process. If representation needs further legal authority, please explain the procedure so the named person can submit directly.

${footer()}`
      ),
      changeNotes:
        "2026-09-30: respect summary access, staged DPDP commencement, explicit voluntary basis and separate grievance timing.",
    },
  })),
  ...[...US_PRIVACY_PACKS, ...FUTURE_US_PRIVACY_PACKS].flatMap((pack) =>
    (Object.entries(pack.requests) as [UsInitialRequestType, string][]).map(
      ([requestType, instructions]) => ({
        key: `us-${pack.region.toLowerCase()}.${requestType.toLowerCase().replaceAll("_", "-")}`,
        name: `${usPackName(pack)} ${requestType.toLowerCase().replaceAll("_", " ")} request`,
        description: `${pack.lawName}: a scoped request, subject to consumer and controller eligibility.`,
        requestType,
        channel: "EMAIL" as const,
        jurisdictionCode: `US-${pack.region}`,
        isActive: true,
        clauses: [...CLAUSES_BASE, "retention-exception-disclosure"],
        version: {
          ...version(
            "Privacy request ({{request.type}}) - reference {{request.reference}}",
            `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request under {{request.legalBasis}} about {{profile.fullName}}, who has confirmed residence in ${usPackName(pack)}, {{profile.country}}.

Please use only these approved identifiers to locate the records and authenticate this request:

{{identifiers.list}}

${instructions}

These rights depend on the applicable consumer and recipient coverage. If an exception applies, please explain which part of the request it affects and the basis for your decision. This request does not assert a right over all exempt or publicly available records.

${VERIFICATION_BLOCK}

{{consent.statement}}

If representation needs additional legal authority, please explain the required procedure. The named individual can use your secure submission channel directly. Please reply to {{reply.address}}, confirm the result and explain any refusal and available appeal process. An opt-out or suppression record is not proof of erasure.

${footer()}`
          ),
          status: FUTURE_US_PRIVACY_PACKS.includes(pack)
            ? ("DRAFT" as const)
            : ("PUBLISHED" as const),
          changeNotes: FUTURE_US_PRIVACY_PACKS.includes(pack)
            ? "2026-10-01: future-law draft. Review enacted source, eligibility and effective date before publication. Never activated automatically."
            : "2026-09-30: state-specific adult consumer instructions; narrower Iowa, Indiana and Utah scopes are preserved, with no universal sharing or deletion claim.",
        },
      })
    )
  ),
  // -------------------------------------------------------------------------
  // Generic templates, one per request type
  // -------------------------------------------------------------------------
  {
    key: "generic.deletion",
    name: "Deletion request (generic)",
    description:
      "Asks the recipient to delete the personal data it holds about the named individual and to say what is retained.",
    requestType: "DELETION",
    channel: "EMAIL",
    isActive: true,
    clauses: [
      ...CLAUSES_BASE,
      "retention-exception-disclosure",
      "third-party-disclosure-list",
    ],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request about the named person’s personal data under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to:
- delete the personal data you hold about the person named above,
- tell me which data you keep and on which legal ground you keep it,
- pass this request on to any service provider or other recipient you disclosed the data to.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what you actually did with the records. If part of this request cannot be carried out, please tell me which part and why.

${footer()}`
    ),
  },
  {
    key: "generic.access",
    name: "Access request (generic)",
    description:
      "Asks for a copy of the personal data held and for information about its sources and recipients.",
    requestType: "ACCESS",
    channel: "EMAIL",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request about the named person’s personal data under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to provide:
- confirmation of whether you hold personal data about the person named above,
- a copy of that data in a commonly used electronic format,
- the categories of data, the purposes of the processing and the sources the data came from,
- the categories of recipients the data was disclosed, sold or shared with.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what you provided. If you withhold any part of the data, please explain which part and on what basis.

${footer()}`
    ),
  },
  {
    key: "generic.correction",
    name: "Correction request (generic)",
    description: "Asks for inaccurate or incomplete personal data to be corrected.",
    requestType: "CORRECTION",
    channel: "EMAIL",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request about the named person’s personal data under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to:
- correct the personal data about the person named above that is inaccurate, outdated or incomplete,
- tell me which fields you changed and which you left unchanged,
- inform the recipients you disclosed the data to about the correction, where that is possible.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what you actually corrected. If you consider the current data accurate, please tell me which source you rely on.

${footer()}`
    ),
  },
  {
    key: "generic.objection",
    name: "Objection request (generic)",
    description:
      "Objects to further processing, in particular processing for direct marketing.",
    requestType: "OBJECTION",
    channel: "EMAIL",
    isActive: true,
    clauses: [...CLAUSES_BASE, "direct-marketing-objection", "restriction-of-processing"],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request about the named person’s personal data under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to:
- stop processing the personal data of the person named above for direct marketing,
- stop any other processing you carry out on the basis of your own interests, unless you can point to grounds that override the interests of the person named above,
- restrict the use of the data while you assess this objection.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm which processing you stopped and which processing continues. If processing continues, please explain the grounds you rely on.

${footer()}`
    ),
  },
  {
    key: "generic.opt-out",
    name: "Opt out request (generic)",
    description:
      "Opts the individual out of the sale, sharing and targeted advertising use of their data.",
    requestType: "OPT_OUT",
    channel: "EMAIL",
    isActive: true,
    clauses: [...CLAUSES_BASE, "opt-out-sale-sharing"],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request about the named person’s personal data under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to:
- stop selling or sharing the personal data of the person named above,
- stop using it for targeted advertising or for building advertising audiences,
- pass this opt out on to the recipients you already sold or shared the data with.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm that the opt out has been applied and from which date. I understand that an opt out is not a deletion.

${footer()}`
    ),
  },
  {
    key: "generic.suppression",
    name: "Suppression request (generic)",
    description:
      "Asks for a suppression record so that the individual is not re-added from a future data source.",
    requestType: "SUPPRESSION",
    channel: "EMAIL",
    isActive: true,
    clauses: [...CLAUSES_BASE, "restriction-of-processing"],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request about the named person’s personal data under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to:
- keep the person named above on your suppression list so that the record is not created again from a later data source,
- restrict the data you keep for that purpose to the minimum needed to recognise and suppress the record,
- not use the suppression record for any other purpose.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm that the suppression record exists and which data it contains.

${footer()}`
    ),
  },
  {
    key: "generic.consent-withdrawal",
    name: "Consent withdrawal (generic)",
    description: "Withdraws consent for further collection, use or disclosure.",
    requestType: "CONSENT_WITHDRAWAL",
    channel: "EMAIL",
    isActive: true,
    clauses: [...CLAUSES_BASE, "consent-withdrawal"],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request about the named person’s personal data under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am withdrawing any consent that the person named above has given you, and I am asking you to:
- stop collecting, using and disclosing the data on the basis of that consent,
- tell me whether you continue to process the data on a different basis, and which basis that is,
- tell me the consequences of the withdrawal for any service the person named above uses.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm from which date the withdrawal takes effect.

${footer()}`
    ),
  },
  {
    key: "generic.follow-up",
    name: "Follow up reminder (generic)",
    description:
      "Polite reminder that references the original request, its reference code and its response date.",
    requestType: "FOLLOW_UP",
    channel: "EMAIL",
    isActive: true,
    clauses: [...CLAUSES_BASE, "deadline-reminder"],
    version: version(
      "Follow up: privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am following up on a privacy request I sent you earlier. The request was a {{request.type}} request made under {{request.legalBasis}}, and it carries the reference {{request.reference}}.

${IDENTIFIER_BLOCK}

The request remains unresolved. Please address any outstanding parts and explain what, if anything, prevents you from completing them.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what has happened with the request and what you have already done. If you need anything from me to continue, please say what it is. If you have already replied, please resend the reply to the address above, as it may not have reached me.

${footer()}`
    ),
  },
  {
    key: "generic.final-reminder",
    name: "Final reminder (generic)",
    description:
      "Last reminder before the individual considers involving the competent authority.",
    requestType: "FINAL_REMINDER",
    channel: "EMAIL",
    isActive: true,
    clauses: [...CLAUSES_BASE, "deadline-reminder"],
    version: version(
      "Final reminder: privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

This is a final reminder about the privacy request with the reference {{request.reference}}. It is a {{request.type}} request made under {{request.legalBasis}} and remains unresolved.

${IDENTIFIER_BLOCK}

I would still prefer to settle this directly with you.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what you have done with the request. If I do not hear from you, I will decide myself whether to take the matter to the relevant privacy authority for the person named above.

${footer()}`
    ),
  },
  {
    key: "generic.escalation",
    name: "Escalation notice (generic)",
    description:
      "Tells the recipient that the individual has decided to involve the competent authority.",
    requestType: "ESCALATION",
    channel: "EMAIL",
    isActive: true,
    clauses: [...CLAUSES_BASE, "deadline-reminder", "escalation-notice"],
    version: version(
      "Escalation: privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am writing about the privacy request with the reference {{request.reference}}, a {{request.type}} request made under {{request.legalBasis}}. The matter is still unresolved.

Organisation: {{broker.name}}
Registered entity: {{broker.legalName}}

${IDENTIFIER_BLOCK}

I have decided to take this matter to the competent supervisory authority. This decision is mine as the individual concerned. The software I use to manage my privacy requests does not contact any authority on my behalf and does not decide anything for me.

${VERIFICATION_BLOCK}

If you would like to resolve this before I file the complaint, please reply in writing to {{reply.address}} and confirm what you have done with the request.

${footer()}`,
      { optional: ["broker.legalName"] }
    ),
  },

  // -------------------------------------------------------------------------
  // California
  // -------------------------------------------------------------------------
  {
    key: "us-ca.deletion",
    name: "Deletion request (California)",
    description:
      "CCPA deletion request that also points to the California deletion mechanism for registered data brokers.",
    requestType: "DELETION",
    channel: "EMAIL",
    jurisdictionCode: "US-CA",
    isActive: true,
    clauses: [
      ...CLAUSES_BASE,
      "retention-exception-disclosure",
      "third-party-disclosure-list",
      "delete-act-platform-reference",
    ],
    version: version(
      "California privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

The person named below is a California resident. I am making a {{request.type}} request about their personal information under {{request.legalBasis}}.

State or region of residence: {{profile.region}}

${IDENTIFIER_BLOCK}

I am asking you to:
- delete the personal information you hold about the person named above,
- direct your service providers and contractors to delete it as well,
- tell me which categories of personal information you keep, and which statutory exception you rely on for keeping them,
- tell me whether you sold or shared the information, and to which categories of third parties.

If you are a data broker registered in California, please also process this request through the deletion mechanism that applies to registered brokers. I am submitting this request directly to you as well so that there is a written record.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what you actually deleted, what you retained and why.

${footer()}`,
      { optional: ["profile.region"] }
    ),
  },
  {
    key: "us-ca.access",
    name: "Access request (California)",
    description:
      "CCPA right to know request covering categories, sources, purposes and recipients.",
    requestType: "ACCESS",
    channel: "EMAIL",
    jurisdictionCode: "US-CA",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "California privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

The person named below is a California resident. I am making a {{request.type}} request about their personal information under {{request.legalBasis}}.

State or region of residence: {{profile.region}}

${IDENTIFIER_BLOCK}

I am asking you to disclose:
- the categories of personal information you collected about the person named above,
- the categories of sources the information came from,
- the business or commercial purpose for collecting, selling or sharing it,
- the categories of third parties to whom you disclosed, sold or shared it,
- the specific pieces of personal information you hold.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what you provided. If you withhold anything, please name the exception you rely on.

${footer()}`,
      { optional: ["profile.region"] }
    ),
  },
  {
    key: "us-ca.correction",
    name: "Correction request (California)",
    description: "CCPA correction request for inaccurate personal information.",
    requestType: "CORRECTION",
    channel: "EMAIL",
    jurisdictionCode: "US-CA",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "California privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

The person named below is a California resident. I am making a {{request.type}} request about their personal information under {{request.legalBasis}}.

State or region of residence: {{profile.region}}

${IDENTIFIER_BLOCK}

I am asking you to:
- correct the inaccurate personal information you hold about the person named above,
- tell me which fields you changed,
- tell me whether you passed the correction on to the third parties you disclosed the information to.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what you corrected. If you decide not to correct a field, please tell me which source you rely on for the current value.

${footer()}`,
      { optional: ["profile.region"] }
    ),
  },
  {
    key: "us-ca.opt-out",
    name: "Opt out of sale or sharing (California)",
    description: "CCPA opt out of the sale and sharing of personal information.",
    requestType: "OPT_OUT",
    channel: "EMAIL",
    jurisdictionCode: "US-CA",
    isActive: true,
    clauses: [...CLAUSES_BASE, "opt-out-sale-sharing"],
    version: version(
      "California privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

The person named below is a California resident. I am making a {{request.type}} request about their personal information under {{request.legalBasis}}.

State or region of residence: {{profile.region}}

${IDENTIFIER_BLOCK}

I am asking you to:
- stop selling and sharing the personal information of the person named above,
- stop using it for cross context behavioural advertising,
- forward the opt out to the third parties you sold or shared the information with in the past.

An opt out request does not need the same verification as a deletion request. ${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm from which date the opt out applies.

${footer()}`,
      { optional: ["profile.region"] }
    ),
  },

  // -------------------------------------------------------------------------
  // Germany (EU GDPR)
  // -------------------------------------------------------------------------
  {
    key: "de.deletion",
    name: "Erasure request (Germany, GDPR)",
    description: "Erasure request under Article 17 GDPR with Article 19 notification.",
    requestType: "DELETION",
    channel: "EMAIL",
    jurisdictionCode: "DE",
    isActive: true,
    clauses: [
      ...CLAUSES_BASE,
      "retention-exception-disclosure",
      "third-party-disclosure-list",
    ],
    version: version(
      "Data protection request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request concerning the person named below under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to:
- erase the personal data you hold about the person named above,
- tell me which data you keep, on which ground of Article 17(3) you keep it and for how long,
- inform the recipients to whom the data was disclosed about the erasure, as required by Article 19, and tell me who those recipients are,
- confirm whether the data was obtained from a third source and which source that was.

${VERIFICATION_BLOCK} Article 12(6) allows you to ask for further information only where you have reasonable doubts about my identity.

Please reply in writing to {{reply.address}} within one month of receiving this request, as provided by Article 12(3), and confirm what you actually did. If you need the extension that Article 12(3) allows, please tell me within that first month.

${footer()}`
    ),
  },
  {
    key: "de.access",
    name: "Access request (Germany, GDPR)",
    description: "Access request under Article 15 GDPR including the copy of the data.",
    requestType: "ACCESS",
    channel: "EMAIL",
    jurisdictionCode: "DE",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "Data protection request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request concerning the person named below under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

Please provide the information listed in Article 15(1), in particular:
- the purposes of the processing and the categories of personal data concerned,
- the recipients or categories of recipients, including recipients in third countries,
- the envisaged storage period or the criteria used to determine it,
- the source of the data, where it was not collected from the person named above,
- whether automated decision making, including profiling, takes place and what logic it follows,
and a copy of the personal data under Article 15(3) in a commonly used electronic format.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} within one month of receiving this request, as provided by Article 12(3), and confirm what you provided.

${footer()}`
    ),
  },
  {
    key: "de.correction",
    name: "Rectification request (Germany, GDPR)",
    description: "Rectification request under Article 16 GDPR.",
    requestType: "CORRECTION",
    channel: "EMAIL",
    jurisdictionCode: "DE",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "Data protection request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request concerning the person named below under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to:
- rectify the inaccurate personal data you hold about the person named above without undue delay,
- complete data that is incomplete for the purpose you process it for,
- inform the recipients of the data about the rectification under Article 19 and tell me who they are.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} within one month of receiving this request and confirm which data you changed. If you do not act on the request, Article 12(4) requires you to tell me why and to point out that I can complain to a supervisory authority.

${footer()}`
    ),
  },
  {
    key: "de.objection",
    name: "Objection (Germany, GDPR)",
    description: "Objection under Article 21 GDPR, including direct marketing.",
    requestType: "OBJECTION",
    channel: "EMAIL",
    jurisdictionCode: "DE",
    isActive: true,
    clauses: [...CLAUSES_BASE, "direct-marketing-objection", "restriction-of-processing"],
    version: version(
      "Data protection request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request concerning the person named below under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I object to:
- the processing of the data of the person named above for direct marketing, which under Article 21(3) means the data may no longer be processed for that purpose,
- any further processing you base on legitimate interests, unless you can demonstrate compelling legitimate grounds that override the interests, rights and freedoms of the person named above.

I also ask you to restrict the processing under Article 18(1)(d) while you assess this objection.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} within one month of receiving this request and confirm which processing has stopped.

${footer()}`
    ),
  },
  {
    key: "de.consent-withdrawal",
    name: "Consent withdrawal (Germany, GDPR)",
    description: "Withdrawal of consent under Article 7(3) GDPR.",
    requestType: "CONSENT_WITHDRAWAL",
    channel: "EMAIL",
    jurisdictionCode: "DE",
    isActive: true,
    clauses: [...CLAUSES_BASE, "consent-withdrawal"],
    version: version(
      "Data protection request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request concerning the person named below under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I withdraw, with effect for the future, any consent given by the person named above, and I ask you to:
- stop every processing operation that relies on that consent,
- tell me whether you continue to process the data on another legal basis under Article 6(1) and which basis that is,
- tell me whether you consider that the withdrawal also removes the basis for keeping the data.

I understand that the withdrawal does not affect the lawfulness of processing carried out before it.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm from which date the withdrawal takes effect.

${footer()}`
    ),
  },

  // -------------------------------------------------------------------------
  // United Kingdom
  // -------------------------------------------------------------------------
  {
    key: "gb.deletion",
    name: "Erasure request (United Kingdom)",
    description: "Erasure request under Article 17 UK GDPR.",
    requestType: "DELETION",
    channel: "EMAIL",
    jurisdictionCode: "GB",
    isActive: true,
    clauses: [
      ...CLAUSES_BASE,
      "retention-exception-disclosure",
      "third-party-disclosure-list",
    ],
    version: version(
      "Data protection request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request concerning the person named below under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to:
- erase the personal data you hold about the person named above,
- tell me which data you keep, on what ground and for how long,
- tell me the recipients you disclosed the data to and whether you informed them of the erasure,
- tell me the source you obtained the data from, if it was not the person named above.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} within one calendar month, as the Information Commissioner's Office expects, and confirm what you actually did. If you need to extend the period because the request is complex, please tell me within that first month.

${footer()}`
    ),
  },
  {
    key: "gb.access",
    name: "Subject access request (United Kingdom)",
    description: "Subject access request under Article 15 UK GDPR.",
    requestType: "ACCESS",
    channel: "EMAIL",
    jurisdictionCode: "GB",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "Subject access request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request concerning the person named below under {{request.legalBasis}}. This is a subject access request.

${IDENTIFIER_BLOCK}

Please provide:
- confirmation of whether you process personal data about the person named above,
- a copy of that personal data,
- the purposes of the processing and the categories of data concerned,
- the recipients or categories of recipients, including any outside the United Kingdom,
- the retention period or the criteria used to set it,
- the source of the data where it did not come from the person named above.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} within one calendar month and confirm what you provided. If you withhold anything under an exemption in the Data Protection Act 2018, please name that exemption.

${footer()}`
    ),
  },
  {
    key: "gb.objection",
    name: "Objection and restriction (United Kingdom)",
    description:
      "Objection under Article 21 UK GDPR combined with a request to restrict processing.",
    requestType: "OBJECTION",
    channel: "EMAIL",
    jurisdictionCode: "GB",
    isActive: true,
    clauses: [...CLAUSES_BASE, "direct-marketing-objection", "restriction-of-processing"],
    version: version(
      "Data protection request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request concerning the person named below under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I object to:
- the use of the data of the person named above for direct marketing, which is an absolute right,
- any other processing you base on legitimate interests, unless you can demonstrate compelling legitimate grounds that override the interests of the person named above.

While you consider the objection, please restrict the processing so that the data is stored but not otherwise used.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} within one calendar month and confirm which processing has stopped and which continues.

${footer()}`
    ),
  },

  // -------------------------------------------------------------------------
  // Brazil
  // -------------------------------------------------------------------------
  {
    key: "br.deletion",
    name: "Deletion request (Brazil, LGPD)",
    description:
      "Deletion, anonymisation or blocking of unnecessary or excessive data under Article 18 LGPD.",
    requestType: "DELETION",
    channel: "EMAIL",
    jurisdictionCode: "BR",
    isActive: true,
    clauses: [
      ...CLAUSES_BASE,
      "retention-exception-disclosure",
      "third-party-disclosure-list",
      "anonymisation-or-blocking",
    ],
    version: version(
      "Data protection request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request concerning the person named below under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to:
- delete the personal data you hold about the person named above that is unnecessary, excessive or processed in a way that does not comply with the law,
- anonymise or block the data where you consider that deletion is not possible, and tell me which option you chose,
- tell me which data you keep and which ground in Article 16 allows you to keep it,
- tell me the public and private entities you shared the data with.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what you actually did with the records.

${footer()}`
    ),
  },
  {
    key: "br.access",
    name: "Access request (Brazil, LGPD)",
    description:
      "Confirmation of processing and access to the data under Articles 18 and 19 LGPD.",
    requestType: "ACCESS",
    channel: "EMAIL",
    jurisdictionCode: "BR",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "Data protection request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request concerning the person named below under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to confirm whether you process personal data about the person named above and to provide:
- access to that data in a clear and complete declaration,
- the origin of the data and the criteria used to process it,
- the purpose of the processing and the legal basis you rely on,
- the public and private entities the data was shared with.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what you provided. Article 19 allows a simplified answer immediately and a complete declaration within 15 days.

${footer()}`
    ),
  },
  {
    key: "br.correction",
    name: "Correction request (Brazil, LGPD)",
    description:
      "Correction of incomplete, inaccurate or outdated data under Article 18 LGPD.",
    requestType: "CORRECTION",
    channel: "EMAIL",
    jurisdictionCode: "BR",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "Data protection request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request concerning the person named below under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to:
- correct the incomplete, inaccurate or outdated personal data you hold about the person named above,
- tell me which fields you changed,
- inform the entities you shared the data with about the correction.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what you corrected.

${footer()}`
    ),
  },
  {
    key: "br.consent-withdrawal",
    name: "Consent withdrawal (Brazil, LGPD)",
    description: "Withdrawal of consent under Articles 8(5) and 18(IX) LGPD.",
    requestType: "CONSENT_WITHDRAWAL",
    channel: "EMAIL",
    jurisdictionCode: "BR",
    isActive: true,
    clauses: [...CLAUSES_BASE, "consent-withdrawal", "direct-marketing-objection"],
    version: version(
      "Data protection request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request concerning the person named below under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I withdraw the consent of the person named above and ask you to:
- stop the processing that relies on that consent, including marketing use,
- tell me whether you continue to process the data on another legal basis in Article 7 and which basis that is,
- tell me the consequences of the withdrawal.

The withdrawal has to be free of charge and simple, and it does not affect processing that took place before it.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm from which date the withdrawal takes effect.

${footer()}`
    ),
  },

  // -------------------------------------------------------------------------
  // Australia
  // -------------------------------------------------------------------------
  {
    key: "au.access",
    name: "Access request (Australia)",
    description: "Access request under Australian Privacy Principle 12.",
    requestType: "ACCESS",
    channel: "EMAIL",
    jurisdictionCode: "AU",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to give me access to the personal information you hold about the person named above, together with:
- the kinds of information you hold,
- how you collected it and from which source,
- the purposes you hold and use it for,
- the entities you disclose it to.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what you provided. If you refuse access on a ground in Australian Privacy Principle 12.3, please give me the written notice that Australian Privacy Principle 12.9 requires, including the reasons and the complaint options.

${footer()}`
    ),
  },
  {
    key: "au.correction",
    name: "Correction request (Australia)",
    description: "Correction request under Australian Privacy Principle 13.",
    requestType: "CORRECTION",
    channel: "EMAIL",
    jurisdictionCode: "AU",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to correct the personal information you hold about the person named above where it is inaccurate, out of date, incomplete, irrelevant or misleading, and to:
- tell me which details you changed,
- notify the entities you previously disclosed the information to, where that is practicable,
- attach a statement to the record if you decide not to correct it.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm what you corrected. If you refuse, please give written reasons and tell me how to complain.

${footer()}`
    ),
  },
  {
    key: "au.opt-out",
    name: "Direct marketing opt out (Australia)",
    description:
      "Direct marketing opt out and request for the source of the information under Australian Privacy Principle 7.",
    requestType: "OPT_OUT",
    channel: "EMAIL",
    jurisdictionCode: "AU",
    isActive: true,
    clauses: [...CLAUSES_BASE, "direct-marketing-objection"],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to:
- stop using and disclosing the personal information of the person named above for direct marketing,
- stop passing it to other organisations for their direct marketing,
- tell me the source you obtained the information from, as Australian Privacy Principle 7.6(d) allows me to ask.

I understand that this request concerns marketing use and that the Privacy Act 1988 does not give me a general right to have the record deleted.

${VERIFICATION_BLOCK}

Please reply in writing to {{reply.address}} and confirm that the request has been actioned and from which date.

${footer()}`
    ),
  },

  // -------------------------------------------------------------------------
  // Singapore
  // -------------------------------------------------------------------------
  {
    key: "sg.access",
    name: "Access request (Singapore)",
    description:
      "Access request under section 21 of the Personal Data Protection Act 2012.",
    requestType: "ACCESS",
    channel: "EMAIL",
    jurisdictionCode: "SG",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to provide:
- the personal data about the person named above that is in your possession or under your control,
- information about the ways in which that data has been used or disclosed in the year before this request.

${VERIFICATION_BLOCK} Please do not ask for a national identity number for this request.

Please reply in writing to {{reply.address}} and confirm what you provided. If you cannot respond within 30 days, please tell me within that period when you will respond. If an exception in the Fifth Schedule applies, please say which one.

${footer()}`
    ),
  },
  {
    key: "sg.correction",
    name: "Correction request (Singapore)",
    description:
      "Correction request under section 22 of the Personal Data Protection Act 2012.",
    requestType: "CORRECTION",
    channel: "EMAIL",
    jurisdictionCode: "SG",
    isActive: true,
    clauses: [...CLAUSES_BASE, "third-party-disclosure-list"],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request under {{request.legalBasis}}.

${IDENTIFIER_BLOCK}

I am asking you to:
- correct the error or omission in the personal data you hold about the person named above,
- send the corrected data to the organisations you disclosed it to in the year before this request, unless they no longer need it,
- tell me which fields you changed.

${VERIFICATION_BLOCK} Please do not ask for a national identity number for this request.

Please reply in writing to {{reply.address}} and confirm what you corrected. If you are satisfied that no correction should be made, please annotate the record with the correction that was requested.

${footer()}`
    ),
  },
  {
    key: "sg.consent-withdrawal",
    name: "Withdrawal of consent (Singapore)",
    description:
      "Withdrawal of consent under section 16 of the Personal Data Protection Act 2012.",
    requestType: "CONSENT_WITHDRAWAL",
    channel: "EMAIL",
    jurisdictionCode: "SG",
    isActive: true,
    clauses: [...CLAUSES_BASE, "consent-withdrawal", "direct-marketing-objection"],
    version: version(
      "Privacy request ({{request.type}}) - reference {{request.reference}}",
      `Dear {{broker.name}} privacy team,

I am making a {{request.type}} request under {{request.legalBasis}}. Please treat this message as reasonable notice of withdrawal.

${IDENTIFIER_BLOCK}

I withdraw the consent of the person named above for the collection, use and disclosure of their personal data, including any use for marketing, and I ask you to:
- stop collecting, using and disclosing the data on the basis of that consent,
- tell me the likely consequences of the withdrawal,
- tell me whether you are required by law to keep any of the data and for how long.

I understand that the Personal Data Protection Act 2012 does not give me a general right to have the record erased.

${VERIFICATION_BLOCK} Please do not ask for a national identity number for this request.

Please reply in writing to {{reply.address}} and confirm from which date the withdrawal takes effect.

${footer()}`
    ),
  },
];
