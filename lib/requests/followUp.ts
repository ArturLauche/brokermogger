import { profileIdentityDigest } from "./envelope";
import { followUpKindSchema, type FollowUpKind } from "./followUpKind";
import {
  scheduleRequestFollowUp,
  commitFollowUpDraft,
  canPrepareFollowUp,
} from "@/lib/db/repositories/requestFollowUp";

import { recordAudit } from "@/lib/audit/service";
import { selectRequestDelivery } from "@/lib/brokers/sendable";
import { getSetting } from "@/lib/config/runtimeSettings";
import { AppError } from "@/lib/core/errors";
import { findPublishedTemplate } from "@/lib/db/repositories/catalog";
import { getOwnedProfile } from "@/lib/db/repositories/profiles";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { countryDisplayName } from "@/lib/jurisdiction/types";
import type { ActorContext } from "@/lib/permissions/actor";
import type { JobLease } from "@/lib/jobs/types";
import { parseJobPayload } from "@/lib/jobs/payloads";
import { REQUEST_TYPE_LABELS } from "@/lib/requests/labels";
import { decryptField, sha256Hex } from "@/lib/security/crypto";
import { renderTemplate } from "@/lib/templates/renderer";

import { deliveryVariables, formatIdentifierList, requestReference } from "./rendering";
export async function prepareFollowUp(
  actor: ActorContext,
  requestId: string,
  kind?: FollowUpKind
) {
  const result = await scheduleRequestFollowUp(
    actor,
    requestId,
    await getSetting("followUpMaxAttempts"),
    kind
  );
  await recordAudit({
    actor,
    action: "request.follow_up_prepared",
    resourceType: "removal_request",
    resourceId: requestId,
  });
  return result;
}

export async function prepareFollowUpDraft(
  actor: ActorContext,
  requestId: string,
  followUpNumber: number,
  job: JobLease,
  kind: FollowUpKind = "FOLLOW_UP"
): Promise<{ message: string }> {
  parseJobPayload("PREPARE_FOLLOW_UP", {
    removalRequestId: requestId,
    followUpNumber,
    kind,
  });
  const maxFollowUps = await getSetting("followUpMaxAttempts");
  if (
    !(await canPrepareFollowUp(actor, requestId, followUpNumber, job, maxFollowUps, kind))
  )
    return {
      message:
        "The follow-up is no longer eligible or this worker no longer holds its lease.",
    };
  const request = await getOwnedRequest(actor, requestId);
  const snapshot = await renderFollowUpSnapshot(actor, request, followUpNumber, kind);
  const result = await commitFollowUpDraft(actor, {
    requestId: request.id,
    followUpNumber,
    job,
    maxFollowUps,
    previousSnapshotId: request.currentSnapshotId,
    snapshot,
    kind,
  });
  if (!result.created)
    return { message: "The follow-up changed before publication. No draft was added." };

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

/** The same renderer serves initial preparation and explicit regeneration. */
export async function renderFollowUpSnapshot(
  actor: ActorContext,
  request: Awaited<ReturnType<typeof getOwnedRequest>>,
  followUpNumber: number,
  kind: FollowUpKind = "FOLLOW_UP"
) {
  followUpKindSchema.parse(kind);
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

  const delivery = selectRequestDelivery(request.broker);
  const template = await findPublishedTemplate({
    requestType: kind,
    jurisdictionId: request.jurisdictionId,
    channel: delivery.channel,
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

  return {
    subject: rendered.subject,
    body: rendered.body,
    templateVersionId: template.version.id,
    legalRuleVersionId: request.legalRuleVersionId,
    variables: {
      ...deliveryVariables(delivery),
      "request.reference": reference,
      "broker.name": request.broker.tradingNames[0] ?? request.broker.legalName,
      followUpNumber: String(followUpNumber),
      followUpKind: kind,
    },
    profileDigest: profileIdentityDigest(profile),
    identifierDigest: sha256Hex(
      selectedIdentifiers
        .map((item) => `${item.id}:${item.valueBi}`)
        .sort()
        .join("|")
    ),
  };
}
