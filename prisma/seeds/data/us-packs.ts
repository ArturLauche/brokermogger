import { US_PRIVACY_PACKS, usPackName, type UsPrivacyPack } from "@/lib/jurisdiction/us";
import type { RequestType } from "@prisma/client";
import type { DeadlinePolicy } from "@/lib/jurisdiction/deadlines";
import type { LegalRuleSeed, LegalRuleVersionSeed } from "./legal-rules";

function ruleVersion(pack: UsPrivacyPack, index: number): LegalRuleVersionSeed {
  const future = index > 0 ? pack.future?.[index - 1] : undefined;
  const sourceUrl = future?.sourceUrl ?? pack.sourceUrl;
  const days = pack.responseDays ?? 45;
  const extensionDays = pack.extensionDays ?? 45;
  const scope = future?.scope ?? pack.scope;
  const requests = future?.requests ?? pack.requests;
  const policy: DeadlinePolicy = {
    version: 1,
    unit: "CALENDAR_DAYS",
    period: days,
    startsFrom: "RECEIPT",
    sourceUrl: pack.sourceUrl,
    verified: true,
    rollForward: "NONE",
    calendar: null,
    extension: {
      unit: "CALENDAR_DAYS",
      period: extensionDays,
      noticeRequired: true,
      conditions:
        "A permitted extension requires a stated reason and notice within the original response period. It is not automatic.",
    },
    conditions: [
      scope,
      "Verification, statutory exclusions and the precise request can affect the outcome. Brokermogger does not infer pauses, extensions or appeal deadlines.",
    ],
    notes: `${pack.sourceTitle}. The initial response period is sourced; a dispatch-based start remains an estimate until receipt is confirmed. This is not an assurance of deletion.`,
  };
  return {
    version: index + 1,
    status: future?.status ?? "PUBLISHED",
    supportedRequestTypes: [
      ...(Object.keys(requests) as RequestType[]),
      "FOLLOW_UP",
      "FINAL_REMINDER",
      "ESCALATION",
    ],
    legalBasisText: `${pack.lawName} (${pack.citation}), for a qualifying ${usPackName(pack)} consumer and covered recipient, subject to the law's applicability conditions and exceptions`,
    deadlineDays: days,
    deadlineRule: {
      policy,
      baseDays: days,
      dayType: "CALENDAR",
      startsFrom: "receipt of the consumer request",
      extension: {
        possible: true,
        additionalDays: extensionDays,
        maxTotalDays: days + extensionDays,
        noticeRequired: true,
        conditions: [policy.extension!.conditions],
      },
      conditions: policy.conditions,
      verified: true,
      notes: policy.notes,
    },
    verificationRequirements: {
      identityVerificationExpected: true,
      governmentIdExpected: false,
      accountRequired: false,
      authorisedAgentSupported: null,
      notarisationExpected: false,
      dataMinimisationNote:
        "Use only approved contact identifiers. A controller may need authentication for some requests or use an existing account; no new account, government ID, date of birth or financial data is supplied by default. Agent authority must be checked for the specific state and request.",
    },
    escalationPath: `Review the controller's published appeal or refusal process and the evidence of the actual response. Where the applicable procedure permits, the individual may review a complaint with ${pack.authority}. The individual submits any appeal or complaint; Brokermogger does not send it automatically or assert a private right of action.`,
    escalationAuthority: pack.authority,
    escalationUrl: pack.authorityUrl,
    templateClauses: [
      "request-identification",
      "legal-basis",
      "identifier-list",
      "scope-limitation",
      "verification-minimisation",
      "retention-exception-disclosure",
      "confirmation-request",
      "household-consent-statement",
    ],
    riskNotes: `${scope} ${pack.note} ${future?.note ?? ""} Only the adult consumer baseline is represented. Residency does not establish business coverage or agent authority. Sale opt-out, suppression and erasure are different outcomes. Not reviewed by counsel.`,
    requiresLegalReview: true,
    confidence: "LOW",
    sourceUrl,
    sourceTitle: future ? `${pack.sourceTitle}; scheduled amendment` : pack.sourceTitle,
    additionalSources: [
      ...(pack.additionalSources ?? []),
      {
        title: `${pack.authority}: guidance and complaint routing`,
        url: pack.authorityUrl,
      },
      ...(future && sourceUrl !== pack.sourceUrl
        ? [{ title: "Current rights and response procedure", url: pack.sourceUrl }]
        : []),
    ],
    lastReviewedAt: "2026-09-30T00:00:00.000Z",
    reviewedBy: "Brokermogger maintainers, unreviewed by counsel",
    effectiveFrom: future?.effectiveFrom ?? pack.effectiveFrom,
    // A source ambiguity must not silently keep an older statutory pack alive.
    ...(index === 0 && pack.future?.[0]?.status === "DRAFT"
      ? { effectiveUntil: pack.future[0].effectiveFrom }
      : {}),
    changeNotes: future
      ? `2026-09-30: separately reviewed future provisions. ${future.note}`
      : "2026-09-30: primary-source state scope, initial request types and receipt-based response policy. Exemptions and representation require individual review.",
  };
}

export function createUsPrivacyPacks(): LegalRuleSeed[] {
  return US_PRIVACY_PACKS.map((pack) => ({
    jurisdictionCode: `US-${pack.region}`,
    key: `${pack.region.toLowerCase()}-consumer-privacy-rights`,
    lawName: pack.lawName,
    shortName: `${usPackName(pack)} consumer rights`,
    description: `${pack.lawName}. ${pack.scope} Initial response: ${pack.responseDays ?? 45} calendar days from receipt, with a conditional extension.`,
    isActive: true,
    versions: [
      ruleVersion(pack, 0),
      ...(pack.future ?? []).map((_, index) => ruleVersion(pack, index + 1)),
    ],
  }));
}
