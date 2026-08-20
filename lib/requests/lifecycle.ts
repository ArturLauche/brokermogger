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
import { SETTINGS } from "@/lib/config/systemSettings";
import { assertConsentAllowsRequests } from "@/lib/consent/status";
import { AppError } from "@/lib/core/errors";
import { decryptField, sha256Hex } from "@/lib/security/crypto";
import {
  findPublishedTemplate,
  getBrokerWithContacts,
  listActiveJurisdictions,
  listPublishedLegalRules,
} from "@/lib/db/repositories/catalog";
import { appendConsentRecord } from "@/lib/db/repositories/consent";
import { createNotification } from "@/lib/db/repositories/notifications";
import { getOwnedProfile } from "@/lib/db/repositories/profiles";
import {
  appendRequestEvent,
  countOpenRequests,
  countRequestsForBroker,
  createDraftRequest,
  getOwnedRequest,
  hasRejectedSimilar,
  insertSnapshot,
  updateRequestStatus,
} from "@/lib/db/repositories/requests";
import { getEmailProvider } from "@/lib/email";
import { hasAlreadySent, recordQueuedEmail, recordSendResult } from "@/lib/email/ledger";
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
import { assertTransition } from "@/lib/requests/stateMachine";
import { evaluateManualReview } from "@/lib/requests/manualReview";
import { renderTemplate } from "@/lib/templates/renderer";
import { IDENTIFIER_TYPE_LABELS } from "@/lib/requests/labels";

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
  assertTransition(from, to, actorKind);
  await updateRequestStatus(requestId, { status: to });
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

  const quota = await consumePolicy(requestCreatePerUserDay, actor.userId);
  if (!quota.allowed) {
    throw new AppError({
      code: "QUOTA_EXCEEDED",
      message: `Fair use limit reached: ${quota.limit} new requests per day.`,
      details: { retryAfterSeconds: quota.retryAfterSeconds },
    });
  }

  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const monthly = await countOpenRequests(actor.userId, monthAgo);
  if (monthly >= SETTINGS.fairUseRequestsPerMonth.defaultValue) {
    throw new AppError({
      code: "QUOTA_EXCEEDED",
      message: "Fair use limit reached: monthly request budget is exhausted.",
    });
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

  for (const brokerId of input.brokerIds) {
    const broker = await getBrokerWithContacts(brokerId);
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
      (await countRequestsForBroker(
        actor.userId,
        broker.id,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      )) >= SETTINGS.fairUseRequestsPerBrokerPer30Days.defaultValue;

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
      brokerPreviouslyRejected: await hasRejectedSimilar(
        actor.userId,
        broker.id,
        input.requestType
      ),
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

    await updateRequestStatus(request.id, {
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
    await updateRequestStatus(request.id, {
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

  await updateRequestStatus(current.id, {
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

  await enqueueJob({
    type: "SEND_REQUEST",
    payload: { removalRequestId: current.id, snapshotId: snapshot.id, attempt: 1 },
    idempotencyKey: `send:${current.id}:${snapshot.id}:1`,
    relatedUserId: actor.userId,
    relatedRequestId: current.id,
  });

  return { requestId: current.id };
}

/**
 * Dispatches an approved request. Called from the SEND_REQUEST job. Retries are
 * safe: `hasAlreadySent` plus the unique constraint prevent a second broker
 * email for the same attempt.
 */
export async function sendApprovedRequest(
  actor: ActorContext,
  removalRequestId: string,
  attempt: number
): Promise<{ message: string }> {
  const request = await getOwnedRequest(actor, removalRequestId);
  const snapshot = request.snapshots[0];
  if (!snapshot) {
    throw new AppError({
      code: "CONFLICT",
      message: "Approved request is missing its snapshot.",
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

  if (await hasAlreadySent(request.id, "BROKER_REQUEST", attempt)) {
    return { message: "Broker email already recorded for this attempt." };
  }

  const provider = getEmailProvider();
  const ledger = await recordQueuedEmail({
    purpose: "BROKER_REQUEST",
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

  const result = await provider.sendBrokerRequestEmail({
    to: { address: destination },
    replyTo: env.EMAIL_REPLY_TO ?? env.EMAIL_FROM,
    subject: snapshot.subject,
    text: snapshot.body,
    removalRequestId: request.id,
    brokerId: request.brokerId,
    attempt,
    isFollowUp: false,
  });

  await recordSendResult(ledger.id, result);

  const capturedLocally = result.provider === "MOCK";
  const sentOk = result.dispatched || capturedLocally;

  if (request.status === "APPROVED") {
    await transition(
      actor,
      request.id,
      "APPROVED",
      "SENT",
      "Queued with the email provider."
    );
    await updateRequestStatus(request.id, { sentAt: result.sentAt });
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

  await recordAudit({
    actor,
    action: "request.sent",
    resourceType: "removal_request",
    resourceId: request.id,
  });

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
  await transition(
    actor,
    request.id,
    request.status,
    "FOLLOW_UP_SCHEDULED",
    "Follow up prepared. Escalation is never filed automatically."
  );
  await enqueueJob({
    type: "PREPARE_FOLLOW_UP",
    payload: { removalRequestId: request.id, followUpNumber: 1 },
    idempotencyKey: `follow-up:${request.id}:1`,
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
