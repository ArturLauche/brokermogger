import { randomUUID } from "node:crypto";

import type { RequestType } from "@prisma/client";

import { recordAudit } from "@/lib/audit/service";
import { evaluateBrokerSendable, selectRequestDelivery } from "@/lib/brokers/sendable";
import { getEffectiveFairUse, getSetting } from "@/lib/config/runtimeSettings";
import { assertCurrentProfileConsent } from "@/lib/consent/current";
import { profileIdentityDigest } from "./envelope";
import { AppError } from "@/lib/core/errors";
import { findAccountCreatedAt } from "@/lib/db/repositories/account";
import {
  findPublishedTemplate,
  getBrokersWithContacts,
  listActiveJurisdictions,
  listPublishedLegalRules,
} from "@/lib/db/repositories/catalog";
import { getOwnedProfile } from "@/lib/db/repositories/profiles";
import {
  createPreparedDrafts,
  type PreparedDraft,
} from "@/lib/db/repositories/requestGeneration";
import {
  countRequestsForBrokers,
  listRejectedBrokerIds,
} from "@/lib/db/repositories/requests";
import {
  primaryRuleForType,
  resolveJurisdiction,
  ruleSupportsRequestType,
} from "@/lib/jurisdiction/resolve";
import { countryDisplayName } from "@/lib/jurisdiction/types";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import {
  BULK_CREATE_WITHOUT_AGE_LIMIT,
  assertBrokerSelectionSize,
  isAccountTooNewForBulk,
  normalizeBrokerIds,
} from "@/lib/requests/fairUse";
import { evaluateManualReview } from "@/lib/requests/manualReview";
import {
  assertBrokerRequestCompatible,
  confirmedRequestCoverage,
} from "@/lib/brokers/coverage";
import { decryptField, sha256Hex } from "@/lib/security/crypto";
import { renderTemplate } from "@/lib/templates/renderer";
import { parseWithSchema } from "@/lib/validation/form";
import { workflowSchema } from "./initial";

import { formatIdentifierList, requestReference } from "./rendering";

export interface GenerateInput {
  profileId: string;
  brokerIds: string[];
  requestType: RequestType;
  identifierIds: string[];
}

export async function prepareRequestDrafts(
  actor: ActorContext,
  raw: unknown,
  existing?: { id: string; reference: string | null }
) {
  requirePermission(actor, "request:create", { ownerUserId: actor.userId });
  const input = parseWithSchema(workflowSchema, raw);

  const brokerIds = normalizeBrokerIds(input.brokerIds);
  assertBrokerSelectionSize(brokerIds.length);

  if (brokerIds.length > BULK_CREATE_WITHOUT_AGE_LIMIT) {
    const minimumAgeHours = await getSetting("fairUseAccountAgeHoursForBulk");
    const createdAt = await findAccountCreatedAt(actor.userId);
    if (isAccountTooNewForBulk({ createdAt, minimumAgeHours })) {
      throw new AppError({
        code: "QUOTA_EXCEEDED",
        message: `New accounts can select at most ${BULK_CREATE_WITHOUT_AGE_LIMIT} brokers at once until the account is ${minimumAgeHours} hours old. This protects the instance. It is not a paid limit.`,
      });
    }
  }

  const profile = await getOwnedProfile(actor, input.profileId);
  assertCurrentProfileConsent(profile);

  const jurisdictions = await listActiveJurisdictions();
  const rules = await listPublishedLegalRules();
  const resolved = resolveJurisdiction(
    {
      countryCode: profile.countryCode,
      region: profile.region,
      residencyConfirmed: profile.residencyConfirmed,
    },
    jurisdictions,
    rules
  );

  if (!ruleSupportsRequestType(resolved, input.requestType)) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "This request type is not available for the selected jurisdiction.",
      details: {
        requestType: input.requestType,
        jurisdiction: resolved.jurisdiction.code,
      },
    });
  }

  const rule = primaryRuleForType(resolved, input.requestType);
  if (!rule) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "No published legal rule covers this request type.",
    });
  }

  const template = await findPublishedTemplate({
    requestType: input.requestType,
    jurisdictionId: resolved.jurisdiction.id,
  });
  if (!template) {
    throw new AppError({
      code: "TEMPLATE_RENDER_FAILED",
      message: "No published template exists for this request type.",
    });
  }

  const selectedIdentifiers = profile.identifiers.filter((identifier) =>
    input.identifierIds.includes(identifier.id)
  );
  if (
    selectedIdentifiers.length === 0 ||
    selectedIdentifiers.length !== new Set(input.identifierIds).size
  ) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Select identifiers belonging to this profile. At least one is required.",
    });
  }

  const decryptedIdentifiers = selectedIdentifiers.map((identifier) => ({
    id: identifier.id,
    type: identifier.type,
    value: decryptField(identifier.valueEnc, {
      table: "ProfileIdentifier",
      column: "valueEnc",
      recordId: identifier.id,
    }),
    masked: identifier.maskedPreview,
    sensitivity: identifier.sensitivity,
  }));

  const legalName = profile.legalNameEnc
    ? decryptField(profile.legalNameEnc, {
        table: "UserProfile",
        column: "legalNameEnc",
        recordId: profile.id,
      })
    : profile.displayName;
  const contactEmail = profile.contactEmailEnc
    ? decryptField(profile.contactEmailEnc, {
        table: "UserProfile",
        column: "contactEmailEnc",
        recordId: profile.id,
      })
    : null;

  if (!contactEmail) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "This profile needs a contact email before a request can be generated.",
    });
  }

  const drafts: PreparedDraft[] = [];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const fairUse = await getEffectiveFairUse(actor.userId);
  const brokers = await getBrokersWithContacts(brokerIds);
  const brokersById = new Map(brokers.map((broker) => [broker.id, broker]));
  const missingBroker = brokerIds.some((brokerId) => !brokersById.has(brokerId));
  if (missingBroker) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "A selected broker does not exist.",
    });
  }

  const volumeByBroker = await countRequestsForBrokers(actor.userId, brokerIds, monthAgo);
  const rejectedBrokerIds = await listRejectedBrokerIds(
    actor.userId,
    brokerIds,
    input.requestType
  );

  for (const brokerId of brokerIds) {
    const broker = brokersById.get(brokerId);
    if (!broker) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "A selected broker does not exist.",
      });
    }

    const coverage = assertBrokerRequestCompatible(
      broker,
      resolved.jurisdiction.id,
      input.requestType
    );

    const sendable = evaluateBrokerSendable({
      id: broker.id,
      slug: broker.slug,
      isActive: broker.isActive,
      isDemoData: broker.isDemoData,
      productionSendingEnabled: broker.productionSendingEnabled,
      productionUnsafeFlag: broker.productionUnsafeFlag,
      deletedAt: broker.deletedAt,
      lastVerifiedAt: broker.lastVerifiedAt,
      sourceUrl: broker.sourceUrl,
      verificationStatus: broker.verificationStatus,
      contactMethods: broker.contactMethods,
      hasJurisdictionCoverage: confirmedRequestCoverage(coverage, input.requestType),
    });

    const delivery = selectRequestDelivery(broker);
    const verification = rule.verificationRequirements as {
      governmentIdExpected?: boolean;
    };
    const brokerRequiresId =
      Boolean(verification.governmentIdExpected) ||
      Boolean(
        (broker.verificationRequirements as { identityDocument?: boolean } | null)
          ?.identityDocument
      );

    const unusualVolume =
      (volumeByBroker.get(broker.id) ?? 0) >= fairUse.requestsPerBrokerPer30Days;

    const review = evaluateManualReview({
      brokerManualReviewRequired: broker.manualReviewRequired,
      coverageUnconfirmed: !confirmedRequestCoverage(coverage, input.requestType),
      confidence: rule.confidence,
      requiresLegalReview: rule.requiresLegalReview,
      brokerRequiresId,
      profileIsOtherPerson: profile.kind !== "SELF",
      consentStatus: profile.consentStatus,
      includesSensitiveIdentifiers: decryptedIdentifiers.some(
        (item) => item.sensitivity === "SENSITIVE"
      ),
      hasVerifiedContactMethod: broker.contactMethods.some((method) => method.isVerified),
      brokerPreviouslyRejected: rejectedBrokerIds.has(broker.id),
      hasCustomText: false,
      targetsRestrictedSource: broker.riskTier === "RESTRICTED",
      riskTier: broker.riskTier,
      destinationUnverified: !broker.contactMethods.some((method) => method.isVerified),
      unusualVolume,
    });

    const requestId = existing?.id ?? randomUUID();
    const reference = existing?.reference ?? requestReference(requestId);
    const consentStatement =
      profile.kind === "SELF"
        ? ""
        : `This request is submitted on behalf of the named individual with their documented consent (reference ${reference}).`;

    const rendered = renderTemplate(
      template.version.subjectTemplate,
      template.version.bodyTemplate,
      {
        "profile.fullName": legalName,
        "profile.email": contactEmail,
        "profile.region": profile.region ?? "",
        "profile.country": countryDisplayName(profile.countryCode),
        "request.type": input.requestType.toLowerCase().replaceAll("_", " "),
        "request.legalBasis": rule.legalBasisText,
        "request.deadlineDate": "",
        "request.reference": reference,
        "broker.name": broker.tradingNames[0] ?? broker.legalName,
        "broker.legalName": broker.legalName,
        "identifiers.list": formatIdentifierList(
          decryptedIdentifiers.map((item) => ({ type: item.type, value: item.value }))
        ),
        "consent.statement": consentStatement,
        "reply.address": contactEmail,
        today: new Date().toISOString().slice(0, 10),
      }
    );

    drafts.push({
      id: requestId,
      profileId: profile.id,
      brokerId: broker.id,
      jurisdictionId: resolved.jurisdiction.id,
      requestType: input.requestType,
      ...delivery,
      legalRuleVersionId: rule.legalRuleVersionId,
      templateVersionId: template.version.id,
      legalBasisText: rule.legalBasisText,
      deadlineDays: rule.deadlineDays,
      manualReviewRequired: review.required,
      manualReviewReasons: review.reasons,
      includedIdentifierIds: decryptedIdentifiers.map((item) => item.id),
      includedIdentifiers: decryptedIdentifiers.map((item) => ({
        type: item.type,
        masked: item.masked,
      })),
      externalReference: reference,
      sendableReasons: sendable.reasons,
      snapshot: {
        subject: rendered.subject,
        body: rendered.body,
        templateVersionId: template.version.id,
        legalRuleVersionId: rule.legalRuleVersionId,
        variables: {
          "request.reference": reference,
          "broker.name": broker.tradingNames[0] ?? broker.legalName,
        },
        profileDigest: profileIdentityDigest(profile),
        identifierDigest: sha256Hex(
          selectedIdentifiers
            .map((item) => `${item.id}:${item.valueBi}`)
            .sort()
            .join("|")
        ),
      },
    });
  }

  return { drafts, fairUse };
}

export async function generateRequests(actor: ActorContext, input: unknown) {
  const { drafts, fairUse } = await prepareRequestDrafts(actor, input);
  const requestIds = await createPreparedDrafts(actor, drafts, fairUse);
  for (const id of requestIds) {
    await recordAudit({
      actor,
      action: "request.created",
      resourceType: "removal_request",
      resourceId: id,
    });
    await recordAudit({
      actor,
      action: "request.rendered",
      resourceType: "removal_request",
      resourceId: id,
    });
  }
  return { requestIds };
}
