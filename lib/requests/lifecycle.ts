/**
 * Request generation, approval and dispatch.
 *
 * This is the product core: a draft is rendered from a published template and
 * a published legal rule version, shown to the user, approved with a hash
 * check, then handed to the job queue. Consent is evaluated at generation and
 * again at send time.
 */
import type {
  ContactMethodType,
  RequestChannel,
  RequestStatus,
  RequestType,
} from "@prisma/client";
import { addDays } from "date-fns";

import { recordAudit } from "@/lib/audit/service";
import { evaluateBrokerSendable, preferredContact } from "@/lib/brokers/sendable";
import { env } from "@/lib/config/env";
import { getEffectiveFairUse, getSetting } from "@/lib/config/runtimeSettings";
import { assertConsentAllowsRequests } from "@/lib/consent/status";
import { AppError } from "@/lib/core/errors";
import { findAccountCreatedAt } from "@/lib/db/repositories/account";
import { decryptField, sha256Hex } from "@/lib/security/crypto";
import {
  findPublishedTemplate,
  getBrokersWithContacts,
  listActiveJurisdictions,
  listPublishedLegalRules,
} from "@/lib/db/repositories/catalog";
import { appendConsentRecord } from "@/lib/db/repositories/consent";
import { createNotification } from "@/lib/db/repositories/notifications";
import { getOwnedProfile } from "@/lib/db/repositories/profiles";
import {
  appendRequestEvent,
  applyRequestStatus,
  countOpenRequests,
  countRequestsForBrokers,
  createDraftRequest,
  getOwnedRequest,
  getSnapshotForRequest,
  insertSnapshot,
  listRejectedBrokerIds,
  patchRequest,
} from "@/lib/db/repositories/requests";
import { assertAdminSendingEnabled, getEmailProvider } from "@/lib/email";
import {
  findSendAttempt,
  recordQueuedEmail,
  recordSendFailure,
  recordSendResult,
  reopenFailedOutboundEmail,
} from "@/lib/email/ledger";
import {
  isOutboundAttemptComplete,
  outboundAttemptLeftTheInstance,
} from "@/lib/email/outboundStatus";
import { consumeBrokerSendThrottles } from "@/lib/email/throttles";
import { enqueueJob } from "@/lib/jobs/queue";
import {
  primaryRuleForType,
  resolveJurisdiction,
  ruleSupportsRequestType,
} from "@/lib/jurisdiction/resolve";
import { countryDisplayName } from "@/lib/jurisdiction/types";
import { createLogger } from "@/lib/observability/logger";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { consumePolicy, requestCreatePerUserDay } from "@/lib/rateLimit";
import {
  BULK_CREATE_WITHOUT_AGE_LIMIT,
  isAccountTooNewForBulk,
} from "@/lib/requests/fairUse";
import { canTransition } from "@/lib/requests/stateMachine";
import { evaluateManualReview } from "@/lib/requests/manualReview";
import { renderTemplate } from "@/lib/templates/renderer";
import { IDENTIFIER_TYPE_LABELS, REQUEST_TYPE_LABELS } from "@/lib/requests/labels";

const log = createLogger("requests.lifecycle");

const CHANNEL_BY_CONTACT: Record<ContactMethodType, RequestChannel> = {
  EMAIL: "EMAIL",
  WEB_FORM: "WEB_FORM",
  PRIVACY_PORTAL_URL: "WEB_FORM",
  POSTAL: "POSTAL",
  API: "API",
  DROP_PLATFORM: "DROP",
};

export interface GenerateInput {
  profileId: string;
  brokerIds: string[];
  requestType: RequestType;
  identifierIds: string[];
}

function requestReference(requestId: string): string {
  return `BM-${sha256Hex(requestId).slice(0, 6).toUpperCase()}`;
}

function formatIdentifierList(
  items: { type: keyof typeof IDENTIFIER_TYPE_LABELS; value: string }[]
): string {
  return items
    .map((item) => `- ${IDENTIFIER_TYPE_LABELS[item.type] ?? item.type}: ${item.value}`)
    .join("\n");
}

async function transition(
  actor: ActorContext,
  requestId: string,
  from: RequestStatus,
  to: RequestStatus,
  message: string
): Promise<void> {
  const actorKind = actor.isSystem ? "SYSTEM" : "USER";
  await applyRequestStatus({
    requestId,
    from,
    to,
    actor: actorKind,
  });
  await appendRequestEvent({
    removalRequestId: requestId,
    type: "STATUS_CHANGE",
    fromStatus: from,
    toStatus: to,
    actorType: actorKind,
    actorUserId: actor.isSystem ? null : actor.userId,
    message,
  });
}

export async function generateRequests(actor: ActorContext, input: GenerateInput) {
  requirePermission(actor, "request:create", { ownerUserId: actor.userId });

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const fairUse = await getEffectiveFairUse(actor.userId);
  const monthly = await countOpenRequests(actor.userId, monthAgo);
  if (monthly >= fairUse.requestsPerMonth) {
    throw new AppError({
      code: "QUOTA_EXCEEDED",
      message: "Fair use limit reached: monthly request budget is exhausted.",
    });
  }

  const quotaLimit = await consumePolicy(requestCreatePerUserDay, actor.userId, {
    limit: fairUse.requestsPerDay,
  });
  if (!quotaLimit.allowed) {
    throw new AppError({
      code: "QUOTA_EXCEEDED",
      message: `Fair use limit reached: ${quotaLimit.limit} new requests per day.`,
      details: { retryAfterSeconds: quotaLimit.retryAfterSeconds },
    });
  }

  if (input.brokerIds.length > BULK_CREATE_WITHOUT_AGE_LIMIT) {
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
  const latestConsent = profile.householdMember?.consents[0];
  assertConsentAllowsRequests({
    profileId: profile.id,
    kind: profile.kind,
    consentStatus: profile.consentStatus,
    consentVerifiedAt:
      latestConsent?.verifiedAt ?? (profile.kind === "SELF" ? new Date() : null),
  });

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
  if (selectedIdentifiers.length === 0) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "Select at least one identifier to include in the request.",
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

  const createdIds: string[] = [];
  const brokers = await getBrokersWithContacts(input.brokerIds);
  const brokersById = new Map(brokers.map((broker) => [broker.id, broker]));
  const volumeByBroker = await countRequestsForBrokers(
    actor.userId,
    input.brokerIds,
    monthAgo
  );
  const rejectedBrokerIds = await listRejectedBrokerIds(
    actor.userId,
    input.brokerIds,
    input.requestType
  );

  for (const brokerId of input.brokerIds) {
    const broker = brokersById.get(brokerId);
    if (!broker) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "A selected broker does not exist.",
      });
    }

    const coverage = broker.jurisdictionCoverage.find(
      (row) => row.jurisdictionId === resolved.jurisdiction.id && row.isActive
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
      hasJurisdictionCoverage: Boolean(coverage),
    });

    const contact = preferredContact({
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
      hasJurisdictionCoverage: Boolean(coverage),
    });

    const channel: RequestChannel = contact ? CHANNEL_BY_CONTACT[contact.type] : "EMAIL";
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

    const request = await createDraftRequest({
      user: { connect: { id: actor.userId } },
      profile: { connect: { id: profile.id } },
      broker: { connect: { id: broker.id } },
      jurisdiction: { connect: { id: resolved.jurisdiction.id } },
      requestType: input.requestType,
      channel,
      status: "DRAFT",
      legalRuleVersion: { connect: { id: rule.legalRuleVersionId } },
      templateVersion: { connect: { id: template.version.id } },
      legalBasisText: rule.legalBasisText,
      deadlineDays: rule.deadlineDays,
      deadlineAt: rule.deadlineDays ? addDays(new Date(), rule.deadlineDays) : null,
      manualReviewRequired: review.required,
      manualReviewReasons: review.reasons,
      destinationType: contact?.type ?? null,
      destinationValue: contact?.value ?? null,
      includedIdentifierIds: decryptedIdentifiers.map((item) => item.id),
      includedIdentifiers: decryptedIdentifiers.map((item) => ({
        type: item.type,
        masked: item.masked,
      })),
      createdById: actor.userId,
    });

    const reference = requestReference(request.id);
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
        "request.deadlineDate": request.deadlineAt
          ? request.deadlineAt.toISOString().slice(0, 10)
          : "",
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

    const snapshot = await insertSnapshot({
      removalRequestId: request.id,
      version: 1,
      subject: rendered.subject,
      body: rendered.body,
      templateVersionId: template.version.id,
      legalRuleVersionId: rule.legalRuleVersionId,
      variables: {
        "request.reference": reference,
        "broker.name": broker.tradingNames[0] ?? broker.legalName,
      },
      identifierDigest: sha256Hex(
        decryptedIdentifiers
          .map((item) => item.id)
          .sort()
          .join("|")
      ),
      createdByUserId: actor.userId,
    });

    await patchRequest(request.id, {
      currentSnapshotId: snapshot.id,
      externalReference: reference,
      metadata: { sendableReasons: sendable.reasons, suspicious: rendered.suspicious },
    });

    await appendRequestEvent({
      removalRequestId: request.id,
      type: "CREATED",
      fromStatus: null,
      toStatus: "DRAFT",
      actorType: "USER",
      actorUserId: actor.userId,
      message: "Draft created.",
    });

    await transition(
      actor,
      request.id,
      "DRAFT",
      "PREPARED",
      "Draft rendered from the published template."
    );

    if (review.required) {
      await transition(
        actor,
        request.id,
        "PREPARED",
        "MANUAL_REVIEW_REQUIRED",
        review.reasons.join(" ")
      );
      await recordAudit({
        actor,
        action: "request.manual_review_flagged",
        resourceType: "removal_request",
        resourceId: request.id,
      });
    } else {
      await transition(
        actor,
        request.id,
        "PREPARED",
        "AWAITING_USER_APPROVAL",
        "Ready for the account holder to approve."
      );
    }

    await recordAudit({
      actor,
      action: "request.created",
      resourceType: "removal_request",
      resourceId: request.id,
    });
    await recordAudit({
      actor,
      action: "request.rendered",
      resourceType: "removal_request",
      resourceId: request.id,
    });

    createdIds.push(request.id);
    log.info({ requestId: request.id, brokerId: broker.id }, "Request draft prepared");
  }

  return { requestIds: createdIds };
}

export async function approveRequest(
  actor: ActorContext,
  input: { requestId: string; contentHash: string; confirmationAccepted: boolean }
) {
  requirePermission(actor, "request:approve", { ownerUserId: actor.userId });

  if (!input.confirmationAccepted) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message:
        "Confirm that you have reviewed the profile, consent status, destination, legal basis and final request text.",
    });
  }

  const request = await getOwnedRequest(actor, input.requestId);
  requirePermission(actor, "request:approve", { ownerUserId: request.userId });

  const snapshot = request.snapshots[0];
  if (!snapshot) {
    throw new AppError({
      code: "CONFLICT",
      message: "This request has no rendered snapshot to approve.",
    });
  }

  if (snapshot.contentHash !== input.contentHash) {
    throw new AppError({
      code: "CONFLICT",
      message: "This text changed. Reload before approving.",
    });
  }

  const latestConsent = await getOwnedProfile(actor, request.profileId);
  const householdConsent = latestConsent.householdMember?.consents[0];
  assertConsentAllowsRequests({
    profileId: latestConsent.id,
    kind: latestConsent.kind,
    consentStatus: latestConsent.consentStatus,
    consentVerifiedAt:
      householdConsent?.verifiedAt ?? (latestConsent.kind === "SELF" ? new Date() : null),
  });

  if (request.status === "MANUAL_REVIEW_REQUIRED") {
    await transition(
      actor,
      request.id,
      "MANUAL_REVIEW_REQUIRED",
      "AWAITING_USER_APPROVAL",
      "Self-service review completed."
    );
    await patchRequest(request.id, {
      manualReviewResolvedAt: new Date(),
      manualReviewResolvedBy: actor.userId,
    });
  }

  const current = await getOwnedRequest(actor, request.id);
  await transition(
    actor,
    current.id,
    current.status,
    "APPROVED",
    "Approved by the account holder."
  );

  await patchRequest(current.id, {
    approvedAt: new Date(),
    approvedByUserId: actor.userId,
  });

  await appendRequestEvent({
    removalRequestId: current.id,
    type: "APPROVAL",
    fromStatus: current.status,
    toStatus: "APPROVED",
    actorType: "USER",
    actorUserId: actor.userId,
    message: "User confirmed the snapshot hash.",
    payload: { contentHash: snapshot.contentHash },
  });

  await recordAudit({
    actor,
    action: "request.approved",
    resourceType: "removal_request",
    resourceId: current.id,
  });

  const approvalStatement =
    "I have reviewed the profile, consent status, destination, legal basis and final request text.";
  await appendConsentRecord({
    profileId: latestConsent.id,
    actorUserId: actor.userId,
    purpose: "REQUEST_SUBMISSION",
    method: "SELF_ATTESTATION",
    status: latestConsent.consentStatus,
    statementText: approvalStatement,
    removalRequestId: current.id,
  });
  await recordAudit({
    actor,
    action: "consent.recorded",
    resourceType: "consent_record",
    resourceId: current.id,
  });

  const sendAttempt = Math.max(current.followUpCount, 1);
  await enqueueJob({
    type: "SEND_REQUEST",
    payload: {
      removalRequestId: current.id,
      snapshotId: snapshot.id,
      attempt: sendAttempt,
    },
    idempotencyKey: `send:${current.id}:${snapshot.id}:${sendAttempt}`,
    relatedUserId: actor.userId,
    relatedRequestId: current.id,
  });

  return { requestId: current.id };
}

/**
 * Dispatches an approved request. Called from the SEND_REQUEST job. Retries are
 * safe: a terminal ledger row is not sent again, and the unique constraint
 * pins one row per `(request, purpose, attempt)`. The snapshot is the one
 * captured at approval, never the latest version (a later follow-up draft).
 */
export async function sendApprovedRequest(
  actor: ActorContext,
  removalRequestId: string,
  attempt: number,
  snapshotId: string
): Promise<{ message: string }> {
  const request = await getOwnedRequest(actor, removalRequestId);
  const snapshot = await getSnapshotForRequest(request.id, snapshotId);
  if (!snapshot) {
    throw new AppError({
      code: "CONFLICT",
      message: "Approved request is missing the snapshot that was queued to send.",
    });
  }

  const profile = await getOwnedProfile(actor, request.profileId);
  const householdConsent = profile.householdMember?.consents[0];
  assertConsentAllowsRequests({
    profileId: profile.id,
    kind: profile.kind,
    consentStatus: profile.consentStatus,
    consentVerifiedAt:
      householdConsent?.verifiedAt ?? (profile.kind === "SELF" ? new Date() : null),
  });

  if (request.status !== "APPROVED" && request.status !== "SENT") {
    return { message: `Nothing to send from status ${request.status}.` };
  }

  if (request.channel !== "EMAIL") {
    if (request.status === "APPROVED") {
      await transition(
        actor,
        request.id,
        "APPROVED",
        "NEEDS_USER_ACTION",
        "This broker is reached through a manual channel. Complete the web form or postal steps yourself. The product will not bypass CAPTCHA, login or access controls."
      );
    }
    return { message: "Manual channel; user action required." };
  }

  const destination = request.destinationValue;
  if (!destination) {
    throw new AppError({
      code: "BROKER_NOT_SENDABLE",
      message: "This request has no destination address.",
    });
  }

  if (env.EMAIL_PROVIDER !== "mock") {
    const sendable = evaluateBrokerSendable({
      id: request.broker.id,
      slug: request.broker.slug,
      isActive: request.broker.isActive,
      isDemoData: request.broker.isDemoData,
      productionSendingEnabled: request.broker.productionSendingEnabled,
      productionUnsafeFlag: request.broker.productionUnsafeFlag,
      deletedAt: request.broker.deletedAt,
      lastVerifiedAt: request.broker.lastVerifiedAt,
      sourceUrl: request.broker.sourceUrl,
      verificationStatus: request.broker.verificationStatus,
      contactMethods: request.broker.contactMethods,
      hasJurisdictionCoverage: request.broker.jurisdictionCoverage.some(
        (row) => row.jurisdictionId === request.jurisdictionId && row.isActive
      ),
    });
    if (!sendable.sendable) {
      throw new AppError({
        code: "BROKER_NOT_SENDABLE",
        message:
          sendable.reasons[0] ?? "This broker cannot be used for production sending.",
        details: { reasons: sendable.reasons },
      });
    }
  }

  const isFollowUp = request.followUpCount > 0;
  const purpose = isFollowUp ? "BROKER_FOLLOW_UP" : "BROKER_REQUEST";
  const existing = await findSendAttempt(request.id, purpose, attempt);

  if (existing && isOutboundAttemptComplete(existing.status)) {
    const sentOk = outboundAttemptLeftTheInstance(existing.status);
    return concludeApprovedSend({
      actor,
      request,
      attempt,
      sentOk,
      capturedLocally: false,
      sentAt: existing.sentAt ?? new Date(),
      alreadyRecorded: true,
    });
  }

  assertAdminSendingEnabled(purpose, await getSetting("sendingEnabledByAdmin"));

  const resumingQueued = existing?.status === "QUEUED";
  if (!resumingQueued) {
    await consumeBrokerSendThrottles({
      brokerId: request.brokerId,
      destination,
    });
  }

  const provider = getEmailProvider();
  let ledgerId: string;
  if (existing?.status === "QUEUED") {
    ledgerId = existing.id;
  } else if (existing?.status === "FAILED") {
    await reopenFailedOutboundEmail(existing.id);
    ledgerId = existing.id;
  } else {
    const queued = await recordQueuedEmail({
      purpose,
      provider: provider.kind,
      toAddress: destination,
      subject: snapshot.subject,
      body: snapshot.body,
      fromAddress: env.EMAIL_FROM,
      replyTo: env.EMAIL_REPLY_TO ?? null,
      removalRequestId: request.id,
      userId: request.userId,
      profileId: request.profileId,
      attempt,
    });
    ledgerId = queued.id;
  }

  let result;
  try {
    result = await provider.sendBrokerRequestEmail({
      to: { address: destination },
      replyTo: env.EMAIL_REPLY_TO ?? env.EMAIL_FROM,
      subject: snapshot.subject,
      text: snapshot.body,
      removalRequestId: request.id,
      brokerId: request.brokerId,
      attempt,
      isFollowUp,
    });
  } catch (error) {
    await recordSendFailure(
      ledgerId,
      error instanceof AppError ? error.code : "send_failed"
    );
    throw error;
  }

  await recordSendResult(ledgerId, result);

  const capturedLocally = result.provider === "MOCK";
  const sentOk = result.dispatched || capturedLocally;
  return concludeApprovedSend({
    actor,
    request,
    attempt,
    sentOk,
    capturedLocally,
    sentAt: result.sentAt,
    alreadyRecorded: false,
  });
}

async function concludeApprovedSend(input: {
  actor: ActorContext;
  request: {
    id: string;
    status: RequestStatus;
    userId: string;
    profileId: string;
    deadlineAt: Date | null;
  };
  attempt: number;
  sentOk: boolean;
  capturedLocally: boolean;
  sentAt: Date;
  alreadyRecorded: boolean;
}): Promise<{ message: string }> {
  const { actor, request, attempt, sentOk, capturedLocally, sentAt } = input;

  if (request.status === "APPROVED") {
    await transition(
      actor,
      request.id,
      "APPROVED",
      "SENT",
      "Queued with the email provider."
    );
    await patchRequest(request.id, { sentAt });
    await transition(
      actor,
      request.id,
      "SENT",
      sentOk ? "WAITING_FOR_BROKER" : "FAILED",
      sentOk
        ? capturedLocally
          ? "Captured by the mock provider. Nothing left the instance. Awaiting a broker reply."
          : "Message handed to the provider. Awaiting a broker reply."
        : "Provider suppressed the message."
    );
  } else if (request.status === "SENT") {
    const next = sentOk ? "WAITING_FOR_BROKER" : "FAILED";
    if (canTransition("SENT", next, "SYSTEM")) {
      await transition(
        actor,
        request.id,
        "SENT",
        next,
        sentOk
          ? "Message already handed to the provider. Awaiting a broker reply."
          : "Provider suppressed the message."
      );
    }
  }

  await createNotification({
    user: { connect: { id: request.userId } },
    profile: { connect: { id: request.profileId } },
    removalRequest: { connect: { id: request.id } },
    type: "REQUEST_SENT",
    title: "Request sent",
    body: sentOk
      ? capturedLocally
        ? "The approved request was captured locally by the mock email provider."
        : "The approved request was handed to the configured email provider."
      : "The approved request was not dispatched.",
    actionUrl: `/requests/${request.id}`,
    dedupeKey: `request-sent:${request.id}:${attempt}`,
  });

  if (!input.alreadyRecorded) {
    await recordAudit({
      actor,
      action: "request.sent",
      resourceType: "removal_request",
      resourceId: request.id,
    });
  }

  if (sentOk && request.deadlineAt) {
    await enqueueJob({
      type: "RECHECK_REMINDER",
      payload: { removalRequestId: request.id },
      idempotencyKey: `recheck:${request.id}`,
      runAt: request.deadlineAt,
      relatedUserId: request.userId,
      relatedRequestId: request.id,
    });
  }

  if (input.alreadyRecorded) {
    return { message: "Broker email already recorded for this attempt." };
  }

  return {
    message: sentOk
      ? capturedLocally
        ? "Broker request captured locally."
        : "Broker request dispatched."
      : "Broker request suppressed.",
  };
}

export async function returnRequestToDraft(actor: ActorContext, requestId: string) {
  requirePermission(actor, "request:update", { ownerUserId: actor.userId });
  const request = await getOwnedRequest(actor, requestId);
  requirePermission(actor, "request:update", { ownerUserId: request.userId });
  await transition(
    actor,
    request.id,
    request.status,
    "DRAFT",
    "Returned to draft by the account holder."
  );
  await recordAudit({
    actor,
    action: "request.approval_rejected",
    resourceType: "removal_request",
    resourceId: request.id,
  });
  return { requestId: request.id };
}

export async function closeRequest(actor: ActorContext, requestId: string) {
  requirePermission(actor, "request:close", { ownerUserId: actor.userId });
  const request = await getOwnedRequest(actor, requestId);
  requirePermission(actor, "request:close", { ownerUserId: request.userId });
  await transition(
    actor,
    request.id,
    request.status,
    "CLOSED",
    "Closed by the account holder."
  );
  await recordAudit({
    actor,
    action: "request.closed",
    resourceType: "removal_request",
    resourceId: request.id,
  });
  return { requestId: request.id };
}

export async function markRequestCompleted(actor: ActorContext, requestId: string) {
  requirePermission(actor, "request:update", { ownerUserId: actor.userId });
  const request = await getOwnedRequest(actor, requestId);
  requirePermission(actor, "request:update", { ownerUserId: request.userId });
  await transition(
    actor,
    request.id,
    request.status,
    "COMPLETED",
    "The account holder marked this request completed."
  );
  await recordAudit({
    actor,
    action: "request.status_changed",
    resourceType: "removal_request",
    resourceId: request.id,
    metadata: { to: "COMPLETED" },
  });
  return { requestId: request.id };
}

export async function prepareFollowUp(actor: ActorContext, requestId: string) {
  requirePermission(actor, "request:update", { ownerUserId: actor.userId });
  const request = await getOwnedRequest(actor, requestId);
  requirePermission(actor, "request:update", { ownerUserId: request.userId });
  const followUpNumber = request.followUpCount + 1;
  await transition(
    actor,
    request.id,
    request.status,
    "FOLLOW_UP_SCHEDULED",
    "Follow up prepared. Escalation is never filed automatically."
  );
  await enqueueJob({
    type: "PREPARE_FOLLOW_UP",
    payload: { removalRequestId: request.id, followUpNumber },
    idempotencyKey: `follow-up:${request.id}:${followUpNumber}`,
    relatedUserId: actor.userId,
    relatedRequestId: request.id,
  });
  await recordAudit({
    actor,
    action: "request.follow_up_prepared",
    resourceType: "removal_request",
    resourceId: request.id,
  });
  return { requestId: request.id };
}

export async function markNoResponse(
  actor: ActorContext,
  requestId: string
): Promise<void> {
  const request = await getOwnedRequest(actor, requestId);
  if (request.status === "NO_RESPONSE") {
    return;
  }
  if (!canTransition(request.status, "NO_RESPONSE", "SYSTEM")) {
    return;
  }
  await transition(
    actor,
    request.id,
    request.status,
    "NO_RESPONSE",
    "The recorded response date passed without a broker reply."
  );
}

export async function applyDeliveryOutcome(
  actor: ActorContext,
  requestId: string,
  outcome: "delivered" | "bounced"
): Promise<void> {
  const request = await getOwnedRequest(actor, requestId);

  if (outcome === "delivered") {
    if (request.status === "SENT" && canTransition("SENT", "DELIVERED", "SYSTEM")) {
      await transition(
        actor,
        request.id,
        "SENT",
        "DELIVERED",
        "The email provider confirmed delivery."
      );
      await transition(
        actor,
        request.id,
        "DELIVERED",
        "WAITING_FOR_BROKER",
        "Awaiting a broker reply."
      );
      return;
    }
    if (
      request.status === "DELIVERED" &&
      canTransition("DELIVERED", "WAITING_FOR_BROKER", "SYSTEM")
    ) {
      await transition(
        actor,
        request.id,
        "DELIVERED",
        "WAITING_FOR_BROKER",
        "Awaiting a broker reply."
      );
      return;
    }
    if (request.status === "WAITING_FOR_BROKER" || request.status === "FOLLOW_UP_SENT") {
      if (!request.deliveredAt) {
        await patchRequest(request.id, { deliveredAt: new Date() });
      }
      await appendRequestEvent({
        removalRequestId: request.id,
        type: "EMAIL_DELIVERED",
        fromStatus: request.status,
        toStatus: request.status,
        actorType: "SYSTEM",
        actorUserId: actor.userId,
        message: "The email provider confirmed delivery.",
      });
    }
    return;
  }

  if (request.status === "SENT" && canTransition("SENT", "FAILED", "SYSTEM")) {
    await transition(
      actor,
      request.id,
      "SENT",
      "FAILED",
      "The email provider reported a bounce."
    );
    return;
  }

  if (
    request.status === "WAITING_FOR_BROKER" &&
    canTransition("WAITING_FOR_BROKER", "NEEDS_USER_ACTION", "SYSTEM")
  ) {
    await transition(
      actor,
      request.id,
      "WAITING_FOR_BROKER",
      "NEEDS_USER_ACTION",
      "Delivery failed after the request was already waiting for a broker reply."
    );
  }
}

export async function prepareFollowUpDraft(
  actor: ActorContext,
  requestId: string,
  followUpNumber: number
): Promise<{ message: string }> {
  const request = await getOwnedRequest(actor, requestId);
  if (
    request.status === "AWAITING_USER_APPROVAL" &&
    request.followUpCount >= followUpNumber
  ) {
    return { message: "Follow up draft already awaits approval." };
  }

  const maxFollowUps = await getSetting("followUpMaxAttempts");
  if (followUpNumber > maxFollowUps) {
    if (canTransition(request.status, "ESCALATION_RECOMMENDED", "SYSTEM")) {
      await transition(
        actor,
        request.id,
        request.status,
        "ESCALATION_RECOMMENDED",
        "Maximum follow ups prepared. Escalation is never filed automatically."
      );
      return {
        message: "Follow up limit reached. Escalation was recommended to the user.",
      };
    }
    return {
      message: `Follow up limit reached. Escalation cannot be recommended from status ${request.status}.`,
    };
  }

  if (request.status !== "FOLLOW_UP_SCHEDULED") {
    if (!canTransition(request.status, "FOLLOW_UP_SCHEDULED", "SYSTEM")) {
      return { message: `Nothing to prepare from status ${request.status}.` };
    }
    await transition(
      actor,
      request.id,
      request.status,
      "FOLLOW_UP_SCHEDULED",
      "Follow up scheduled. Escalation is never filed automatically."
    );
  }

  const profile = await getOwnedProfile(actor, request.profileId);
  const contactEmail = profile.contactEmailEnc
    ? decryptField(profile.contactEmailEnc, {
        table: "UserProfile",
        column: "contactEmailEnc",
        recordId: profile.id,
      })
    : null;
  const legalName = profile.legalNameEnc
    ? decryptField(profile.legalNameEnc, {
        table: "UserProfile",
        column: "legalNameEnc",
        recordId: profile.id,
      })
    : profile.displayName;

  if (!contactEmail) {
    throw new AppError({
      code: "VALIDATION_FAILED",
      message: "This profile needs a contact email before a follow up can be prepared.",
    });
  }

  const selectedIdentifiers = profile.identifiers.filter((identifier) =>
    request.includedIdentifierIds.includes(identifier.id)
  );
  const decryptedIdentifiers = selectedIdentifiers.map((identifier) => ({
    id: identifier.id,
    type: identifier.type,
    value: decryptField(identifier.valueEnc, {
      table: "ProfileIdentifier",
      column: "valueEnc",
      recordId: identifier.id,
    }),
  }));

  const template = await findPublishedTemplate({
    requestType: "FOLLOW_UP",
    jurisdictionId: request.jurisdictionId,
  });
  if (!template) {
    throw new AppError({
      code: "TEMPLATE_RENDER_FAILED",
      message: "No published follow-up template exists.",
    });
  }

  const reference = request.externalReference ?? requestReference(request.id);
  const rendered = renderTemplate(
    template.version.subjectTemplate,
    template.version.bodyTemplate,
    {
      "profile.fullName": legalName,
      "profile.email": contactEmail,
      "profile.region": profile.region ?? "",
      "profile.country": countryDisplayName(profile.countryCode),
      "request.type": REQUEST_TYPE_LABELS[request.requestType],
      "request.legalBasis": request.legalBasisText,
      "request.deadlineDate": request.deadlineAt
        ? request.deadlineAt.toISOString().slice(0, 10)
        : "",
      "request.reference": reference,
      "broker.name": request.broker.tradingNames[0] ?? request.broker.legalName,
      "broker.legalName": request.broker.legalName,
      "identifiers.list": formatIdentifierList(
        decryptedIdentifiers.map((item) => ({ type: item.type, value: item.value }))
      ),
      "consent.statement":
        profile.kind === "SELF"
          ? ""
          : `This follow up is submitted on behalf of the named individual with their documented consent (reference ${reference}).`,
      "reply.address": contactEmail,
      today: new Date().toISOString().slice(0, 10),
    }
  );

  const nextVersion = (request.snapshots[0]?.version ?? 0) + 1;
  const snapshot = await insertSnapshot({
    removalRequestId: request.id,
    version: nextVersion,
    subject: rendered.subject,
    body: rendered.body,
    templateVersionId: template.version.id,
    legalRuleVersionId: request.legalRuleVersionId,
    variables: {
      "request.reference": reference,
      "broker.name": request.broker.tradingNames[0] ?? request.broker.legalName,
      followUpNumber: String(followUpNumber),
    },
    identifierDigest: sha256Hex(
      decryptedIdentifiers
        .map((item) => item.id)
        .sort()
        .join("|")
    ),
    createdByUserId: actor.isSystem ? null : actor.userId,
  });

  await patchRequest(request.id, {
    currentSnapshotId: snapshot.id,
    followUpCount: followUpNumber,
    nextFollowUpAt: null,
  });

  await transition(
    actor,
    request.id,
    "FOLLOW_UP_SCHEDULED",
    "AWAITING_USER_APPROVAL",
    "Follow up draft ready for the account holder to approve. Nothing will be sent automatically."
  );

  const notification = await createNotification({
    user: { connect: { id: request.userId } },
    profile: { connect: { id: request.profileId } },
    removalRequest: { connect: { id: request.id } },
    type: "APPROVAL_NEEDED",
    channel: "EMAIL",
    severity: "ACTION_REQUIRED",
    title: "Follow up ready to review",
    body: "A follow up draft is waiting for your approval. Nothing will be sent until you review the exact text.",
    actionUrl: `/requests/${request.id}/review`,
    dedupeKey: `follow-up-approval:${request.id}:${followUpNumber}`,
  });
  await enqueueJob({
    type: "DISPATCH_NOTIFICATION",
    payload: { notificationId: notification.id },
    idempotencyKey: `notify:${notification.id}`,
    relatedUserId: request.userId,
    relatedRequestId: request.id,
  });

  await recordAudit({
    actor,
    action: "request.follow_up_prepared",
    resourceType: "removal_request",
    resourceId: request.id,
    metadata: { followUpNumber },
  });

  return {
    message:
      "Follow up drafts are prepared for user approval. Escalation is never filed automatically.",
  };
}
