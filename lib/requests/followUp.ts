import {
  scheduleRequestFollowUp,
  commitFollowUpDraft,
} from "@/lib/db/repositories/requestFollowUp";

import { recordAudit } from "@/lib/audit/service";
import { getSetting } from "@/lib/config/runtimeSettings";
import { AppError } from "@/lib/core/errors";
import { findPublishedTemplate } from "@/lib/db/repositories/catalog";
import { getOwnedProfile } from "@/lib/db/repositories/profiles";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { countryDisplayName } from "@/lib/jurisdiction/types";
import type { ActorContext } from "@/lib/permissions/actor";
import { REQUEST_TYPE_LABELS } from "@/lib/requests/labels";
import { canTransition } from "@/lib/requests/stateMachine";
import { decryptField, sha256Hex } from "@/lib/security/crypto";
import { renderTemplate } from "@/lib/templates/renderer";

import { formatIdentifierList, requestReference } from "./rendering";
import { transition } from "./transitions";
export async function prepareFollowUp(actor: ActorContext, requestId: string) {
  const result = await scheduleRequestFollowUp(
    actor,
    requestId,
    await getSetting("followUpMaxAttempts")
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

  if (request.status !== "FOLLOW_UP_SCHEDULED")
    return { message: "This request no longer needs a follow-up draft." };

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

  await commitFollowUpDraft(actor, {
    requestId: request.id,
    followUpNumber,
    previousSnapshotId: request.currentSnapshotId,
    snapshot: {
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
        selectedIdentifiers
          .map((item) => `${item.id}:${item.valueBi}`)
          .sort()
          .join("|")
      ),
    },
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
