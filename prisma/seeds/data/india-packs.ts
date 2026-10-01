import type { LegalRuleSeed } from "./legal-rules";

export const DPDP_RIGHTS_EFFECTIVE_FROM = "2027-05-12T18:30:00.000Z";
export const DPDP_COMMENCEMENT_SOURCE =
  "https://egazette.gov.in/WriteReadData/2025/267647.pdf";
export const DPDP_RULES_SOURCE =
  "https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf";

/** Statutory rights wait for commencement; today's requests are explicitly voluntary. */
export function createIndiaPacks(definition: LegalRuleSeed): LegalRuleSeed[] {
  const original = definition.versions[0]!;
  const {
    escalationAuthority: _authority,
    escalationUrl: _url,
    ...voluntaryOriginal
  } = original;
  const policy = {
    version: 1 as const,
    unit: "NONE" as const,
    period: null,
    startsFrom: "RECEIPT" as const,
    sourceUrl: DPDP_RULES_SOURCE,
    verified: true,
    rollForward: "NONE" as const,
    calendar: null,
    extension: null,
    conditions: [
      "Rule 14(3)'s period concerns grievances. No universal initial access/correction/erasure response period is asserted.",
    ],
    notes:
      "Final Rules, G.S.R. 846(E), rule 14; the grievance redressal period is not an initial rights-request deadline.",
  };
  const future: LegalRuleSeed = {
    ...definition,
    description:
      "DPDP statutory summary access, correction and erasure rights scheduled for May 13, 2027, under G.S.R. 843(E). They are unavailable before that effective date.",
    retirePublishedBefore: DPDP_RIGHTS_EFFECTIVE_FROM,
    versions: [
      {
        ...original,
        legalBasisText:
          "sections 11 to 13 of the Digital Personal Data Protection Act 2023 and rule 14 of the final Digital Personal Data Protection Rules 2025, for an eligible data principal, subject to commencement, consent, applicability and lawful retention",
        deadlineRule: {
          ...original.deadlineRule,
          policy,
          conditions: policy.conditions,
          verified: true,
          notes: policy.notes,
        },
        escalationPath:
          "Use the data fiduciary's published grievance mechanism before considering an eligible complaint to the Data Protection Board of India. Rule 14(3) requires a published grievance response period no longer than 90 days; it does not impose a universal 90-day initial rights-request deadline. The individual decides and submits any complaint.",
        riskNotes:
          "G.S.R. 843(E) schedules sections 11–17 for May 13, 2027, eighteen months after publication. Rule 14 asks the data principal to use the fiduciary's specified means where consent was previously given. Summary access is not full-copy access to every record. Verify territorial scope, exemptions, representation and any retention duty. No children's or government-ID data is collected by this instance. Not reviewed by counsel.",
        sourceUrl: DPDP_COMMENCEMENT_SOURCE,
        sourceTitle: "Government of India Gazette, G.S.R. 843(E), DPDP Act commencement",
        additionalSources: [
          {
            title:
              "Final Digital Personal Data Protection Rules 2025, commencement and rule 14",
            url: DPDP_RULES_SOURCE,
          },
          {
            title:
              "DPDP implementation timeline, Ministry of Electronics and Information Technology",
            url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2261823&lang=1&reg=3",
          },
        ],
        lastReviewedAt: "2026-09-30T00:00:00.000Z",
        effectiveFrom: DPDP_RIGHTS_EFFECTIVE_FROM,
        changeNotes:
          "2026-09-30: verified final commencement and rules. Withdraw the legacy premature statutory version; activate rights on May 13, 2027 in India, without turning grievance timing into an initial deadline.",
      },
    ],
  };
  const voluntary: LegalRuleSeed = {
    jurisdictionCode: "IN",
    key: "india-voluntary-privacy-request",
    lawName: "Voluntary privacy request before DPDP rights commence",
    shortName: "India — voluntary request",
    description:
      "A request under the recipient's policy, without claiming commenced DPDP rights. The recipient may decline; no statutory response target is applied.",
    isActive: true,
    versions: [
      {
        ...voluntaryOriginal,
        supportedRequestTypes: [
          "ACCESS",
          "CORRECTION",
          "DELETION",
          "FOLLOW_UP",
          "FINAL_REMINDER",
        ],
        legalBasisText:
          "your privacy policy and a voluntary request by the named individual; this request does not claim that DPDP statutory access, correction or erasure rights have commenced",
        deadlineRule: {
          ...original.deadlineRule,
          policy: {
            ...policy,
            sourceUrl: DPDP_COMMENCEMENT_SOURCE,
            conditions: [
              "This is a voluntary request before DPDP rights commencement; there is no asserted statutory response period.",
            ],
            notes: "No deadline or guaranteed regulatory remedy is claimed.",
          },
          conditions: [
            "The recipient may decline a voluntary request. The DPDP rights pack is scheduled separately.",
          ],
          verified: true,
          notes:
            "No statutory response period is claimed for a voluntary policy request.",
        },
        escalationPath:
          "Review the recipient's privacy policy and any available voluntary complaint route. This request does not claim an already commenced DPDP statutory enforcement route. The individual chooses any further action.",
        riskNotes:
          "This current pack relies on voluntary cooperation or the recipient's own policy. It does not claim DPDP rights before May 13, 2027. A refusal does not by itself establish a statutory violation; other applicable law needs individual legal review. Not reviewed by counsel.",
        sourceUrl: DPDP_COMMENCEMENT_SOURCE,
        sourceTitle: "Government of India Gazette, staged DPDP commencement",
        additionalSources: [{ title: "Final DPDP Rules 2025", url: DPDP_RULES_SOURCE }],
        lastReviewedAt: "2026-09-30T00:00:00.000Z",
        effectiveFrom: "2026-09-30T00:00:00.000Z",
        effectiveUntil: DPDP_RIGHTS_EFFECTIVE_FROM,
        changeNotes:
          "2026-09-30: offer explicitly voluntary requests while statutory rights remain scheduled, with no statutory deadline or automatic agency complaint.",
      },
    ],
  };
  return [future, voluntary];
}
