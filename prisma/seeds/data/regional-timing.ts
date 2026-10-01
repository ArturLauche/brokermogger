/** Actual primary-source review: 2026-09-30. Private broker timing is not agency timing. */
import type { DeadlinePolicy } from "@/lib/jurisdiction/deadlines";
import type { LegalRuleSeed, LegalRuleVersionSeed } from "./legal-rules";

const REVIEWED_ON = "2026-09-30T00:00:00.000Z";
const BRAZIL_SOURCE =
  "https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm";
const SMALL_CONTROLLER_SOURCE =
  "https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022";
const AU_GUIDELINES =
  "https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/";
const SG_SOURCE = "https://sso.agc.gov.sg/SL/PDPA2012-S63-2021?ProvIds=pr5-";

function noCompletionPeriod(sourceUrl: string, notes: string): DeadlinePolicy {
  return {
    version: 1,
    unit: "NONE",
    period: null,
    startsFrom: "RECEIPT",
    sourceUrl,
    verified: true,
    rollForward: "NONE",
    calendar: null,
    extension: null,
    conditions: [],
    notes,
  };
}
function withPolicy(
  version: LegalRuleVersionSeed,
  policy: DeadlinePolicy
): LegalRuleVersionSeed {
  return {
    ...version,
    deadlineDays: policy.unit === "CALENDAR_DAYS" ? policy.period : null,
    deadlineRule: {
      policy,
      baseDays: policy.unit === "CALENDAR_DAYS" ? policy.period : null,
      dayType: "CALENDAR",
      startsFrom: "recorded receipt or a clearly labelled submission estimate",
      extension: {
        possible: Boolean(policy.extension),
        additionalDays: policy.extension?.period ?? null,
        maxTotalDays: policy.extension
          ? (policy.period ?? 0) + policy.extension.period
          : null,
        noticeRequired: policy.extension?.noticeRequired ?? false,
        conditions: policy.extension ? [policy.extension.conditions] : [],
      },
      conditions: policy.conditions,
      verified: policy.verified,
      notes: policy.notes,
    },
    lastReviewedAt: REVIEWED_ON,
    changeNotes:
      "2026-09-30: distinguish sourced access periods, reasonable-period guidance and notification duties; never borrow a completion clock from another right.",
  };
}

export function reviewRegionalTiming(rules: readonly LegalRuleSeed[]): LegalRuleSeed[] {
  return rules.flatMap((rule): LegalRuleSeed[] => {
    if (rule.jurisdictionCode === "BR") {
      const corrected: LegalRuleSeed = {
        ...rule,
        versions: rule.versions.map((version) => ({
          ...withPolicy(
            version,
            noCompletionPeriod(
              BRAZIL_SOURCE,
              "Article 19's 15-day complete declaration is an access duty, not a universal correction, deletion, objection or consent-withdrawal period. Article 18 requires immediate action or an explanation of the obstacle; specific rules may apply."
            )
          ),
          supportedRequestTypes: version.supportedRequestTypes.filter(
            (type) => type !== "ACCESS"
          ),
          escalationAuthority: "Agência Nacional de Proteção de Dados (ANPD)",
          riskNotes:
            version.riskNotes +
            " Objection requires noncompliance with the LGPD; deletion remains subject to Article 16 retention and the applicable Article 18 conditions. The access declaration's timing is not applied to these other rights.",
        })),
      };
      if (rule.key !== "lgpd-data-subject-rights") return [corrected];
      const original = rule.versions[0]!;
      const policy: DeadlinePolicy = {
        ...noCompletionPeriod(
          BRAZIL_SOURCE,
          "Article 19 provides immediate simplified confirmation/access or a complete declaration within 15 days of the request. Qualifying small controllers have differentiated periods under Resolution 2/2022 Articles 14–15; verify qualification before relying on the baseline."
        ),
        unit: "CALENDAR_DAYS",
        period: 15,
        extension: {
          unit: "CALENDAR_DAYS",
          period: 15,
          noticeRequired: false,
          conditions:
            "A qualifying small controller receives double time for the complete declaration under Resolution 2/2022 Article 14(III). Review Article 3 exclusions; this is not applied automatically.",
        },
        conditions: [
          "This target is solely the Article 19(II) complete declaration. The ordinary simplified declaration is immediate, subject to the small-controller rules.",
          "Public-sector and specifically regulated cases can use different procedures and periods. Verify the controller and request scope.",
        ],
      };
      return [
        corrected,
        {
          ...rule,
          key: "lgpd-access-declaration",
          shortName: "LGPD access declaration",
          description:
            "Confirmation and access under Articles 18(I–II) and 19, with a separate sourced declaration period.",
          versions: [
            {
              ...withPolicy(original, policy),
              supportedRequestTypes: [
                "ACCESS",
                "FOLLOW_UP",
                "FINAL_REMINDER",
                "ESCALATION",
              ],
              legalBasisText:
                "Articles 18(I–II) and 19 of the Lei Geral de Proteção de Dados Pessoais (Lei 13.709/2018), for confirmation of processing and access to the named person's personal data, subject to the applicable scope and exceptions",
              additionalSources: [
                ...original.additionalSources,
                {
                  title:
                    "ANPD Resolution 2/2022, differentiated small-controller periods",
                  url: SMALL_CONTROLLER_SOURCE,
                },
              ],
              escalationAuthority: "Agência Nacional de Proteção de Dados (ANPD)",
              riskNotes:
                "Article 19 concerns confirmation and access. Request a simplified declaration immediately or a complete declaration identifying data origin, records, criteria and purpose within the applicable period. Small-controller qualification, sector-specific rules, public-sector procedures and trade secrets require review. Do not apply this access period to deletion or correction. Not reviewed by counsel.",
            },
          ],
        },
      ];
    }
    if (rule.jurisdictionCode === "AU") {
      const access = rule.key === "privacy-act-access-correction";
      const sourceUrl =
        AU_GUIDELINES +
        (access
          ? "chapter-12-app-12-access-to-personal-information"
          : "chapter-7-app-7-direct-marketing");
      return [
        {
          ...rule,
          versions: rule.versions.map((version) => ({
            ...withPolicy(
              version,
              noCompletionPeriod(
                sourceUrl,
                access
                  ? "For private organisations APPs 12 and 13 require a reasonable response period. OAIC's general 30-calendar-day guide is not a universal statutory completion limit. The separate fixed agency period is not applied to brokers."
                  : "APP 7 marketing opt-outs must be implemented within a reasonable period. No fixed day count or general erasure right is asserted."
              )
            ),
            riskNotes:
              version.riskNotes +
              " The private organisation's reasonable period depends on the request; a government agency's fixed period is not borrowed.",
            additionalSources: [
              ...version.additionalSources,
              {
                title: "OAIC, APP 12 access guidance",
                url: AU_GUIDELINES + "chapter-12-app-12-access-to-personal-information",
              },
              {
                title: "OAIC, APP 13 correction guidance",
                url:
                  AU_GUIDELINES + "chapter-13-app-13-correction-of-personal-information",
              },
            ],
          })),
        },
      ];
    }
    if (rule.jurisdictionCode === "SG") {
      const access = rule.key === "pdpa-access-correction";
      return [
        {
          ...rule,
          versions: rule.versions.map((version) => ({
            ...withPolicy(
              version,
              noCompletionPeriod(
                access ? SG_SOURCE : version.sourceUrl,
                access
                  ? "Access is due as soon as reasonably possible and correction as soon as practicable. Regulation 5 requires written notification within 30 days if the organisation cannot comply, giving its response timeframe. That notification duty is not a universal full-completion deadline; record and review the promised response separately."
                  : "Consent withdrawal uses reasonable notice and can have consequences. It does not create an erasure right or a fixed completion period."
              )
            ),
            riskNotes:
              version.riskNotes +
              (access
                ? " Regulation 5's 30-day duty concerns notification of a later response timeframe when compliance is not possible within that period. A delay notice is not completion."
                : " Reasonable notice is assessed in context."),
            additionalSources: [
              ...version.additionalSources,
              {
                title:
                  "Singapore Personal Data Protection Regulations 2021, regulation 5",
                url: SG_SOURCE,
              },
            ],
          })),
        },
      ];
    }
    return [rule];
  });
}
