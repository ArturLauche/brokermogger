/**
 * Household adult invitations with double opt-in email.
 */
import { addDays } from "date-fns";

import { recordAudit } from "@/lib/audit/service";
import { env } from "@/lib/config/env";
import { ValidationError } from "@/lib/core/errors";
import { createHouseholdAdult } from "@/lib/db/repositories/profiles";
import {
  createHouseholdConsent,
  findHouseholdConsentByTokenHash,
  listHouseholdForOwner,
  softDeleteHouseholdMember,
  updateHouseholdConsent,
  updateHouseholdMemberStatus,
  updateProfileConsentStatus,
} from "@/lib/db/repositories/household";
import { appendConsentRecord } from "@/lib/db/repositories/consent";
import { createNotification } from "@/lib/db/repositories/notifications";
import { buildConsentInviteMessage, getEmailProvider } from "@/lib/email";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { randomToken, sha256Hex, encryptField, blindIndex } from "@/lib/security/crypto";
import { maskIdentifier } from "@/lib/security/masking";
import { sanitiseText } from "@/lib/security/sanitize";
import type { HouseholdRelationship } from "@prisma/client";

const CONSENT_STATEMENT =
  "I confirm that I am an adult and that the account holder may prepare and send privacy requests about me using Brokermogger. I understand Brokermogger is not a law firm and does not guarantee removal.";

export const HOUSEHOLD_ADULT_CONFIRMATION =
  "I confirm this person is an adult and I will only send requests after they accept the invitation.";

export async function inviteHouseholdAdult(
  actor: ActorContext,
  input: {
    displayName: string;
    relationship: HouseholdRelationship;
    invitedEmail: string;
    countryCode: string;
    region: string | null;
    adultConfirmed: boolean;
  }
) {
  requirePermission(actor, "household:manage", { ownerUserId: actor.userId });

  if (!input.adultConfirmed) {
    throw new ValidationError(
      "Confirm that this person is an adult before sending an invitation."
    );
  }
  if (input.relationship === "SELF") {
    throw new ValidationError("A household profile cannot use the self relationship.");
  }

  const displayName = sanitiseText(input.displayName, { fieldName: "displayName" });
  const email = input.invitedEmail.trim().toLowerCase();

  const { profile, member } = await createHouseholdAdult(actor, {
    displayName,
    legalName: displayName,
    countryCode: input.countryCode,
    region: input.region,
    residencyConfirmed: true,
    invitedEmail: email,
    relationship: input.relationship,
  });

  const token = randomToken();
  const expiresAt = addDays(new Date(), 7);
  const consent = await createHouseholdConsent({
    householdMember: { connect: { id: member.id } },
    profile: { connect: { id: profile.id } },
    requestedBy: { connect: { id: actor.userId } },
    status: "PENDING",
    contactEmailEnc: encryptField(email, {
      table: "HouseholdConsent",
      column: "contactEmailEnc",
      recordId: profile.id,
    }),
    contactEmailBi: blindIndex(email, "household:email", "email"),
    contactEmailMasked: maskIdentifier("EMAIL", email),
    tokenHash: sha256Hex(token),
    statementText: CONSENT_STATEMENT,
    statementHash: sha256Hex(CONSENT_STATEMENT),
    expiresAt,
  });

  const acceptUrl = `${env.APP_BASE_URL}/household/consent/${token}`;
  await getEmailProvider().sendEmail(
    buildConsentInviteMessage({
      to: { address: email },
      acceptUrl,
      requesterDisplayName: "the account holder",
      expiresAt,
    })
  );

  await createNotification({
    user: { connect: { id: actor.userId } },
    profile: { connect: { id: profile.id } },
    type: "HOUSEHOLD_CONSENT_UPDATE",
    title: "Household invitation sent",
    body: "The invitation is waiting for the other adult to agree or decline.",
    actionUrl: "/household",
    dedupeKey: `household-invite:${consent.id}`,
  });

  await recordAudit({
    actor,
    action: "household.member_added",
    resourceType: "household_member",
    resourceId: member.id,
  });
  await recordAudit({
    actor,
    action: "household.consent_invited",
    resourceType: "household_consent",
    resourceId: consent.id,
  });

  return { profileId: profile.id, memberId: member.id };
}

export async function listHousehold(actor: ActorContext) {
  return listHouseholdForOwner(actor);
}

export async function removeHouseholdMember(actor: ActorContext, memberId: string) {
  const member = await softDeleteHouseholdMember(actor, memberId);
  await recordAudit({
    actor,
    action: "household.member_removed",
    resourceType: "household_member",
    resourceId: member.id,
  });
}

export async function resolveConsentInvitation(token: string) {
  const tokenHash = sha256Hex(token);
  const consent = await findHouseholdConsentByTokenHash(tokenHash);
  if (!consent) {
    return null;
  }
  if (consent.status !== "PENDING") {
    return consent;
  }
  if (consent.expiresAt.getTime() < Date.now()) {
    await updateHouseholdConsent(consent.id, { status: "EXPIRED" });
    return { ...consent, status: "EXPIRED" as const };
  }
  return consent;
}

export async function decideHouseholdConsent(input: {
  token: string;
  decision: "agree" | "decline";
  ipHash: string | null;
  userAgentHash: string | null;
}) {
  const consent = await resolveConsentInvitation(input.token);
  if (!consent || consent.status !== "PENDING") {
    throw new ValidationError("This invitation is no longer valid.");
  }

  if (input.decision === "decline") {
    await updateHouseholdConsent(consent.id, {
      status: "DECLINED",
      declinedAt: new Date(),
      verificationIpHash: input.ipHash,
      verificationUserAgentHash: input.userAgentHash,
    });
    await updateProfileConsentStatus(consent.profileId, "NOT_ALLOWED");
    await updateHouseholdMemberStatus(consent.householdMemberId, "REVOKED");
    await appendConsentRecord({
      profileId: consent.profileId,
      actorUserId: consent.requestedByUserId,
      purpose: "PROFILE_MANAGEMENT",
      method: "DOUBLE_OPT_IN_EMAIL",
      status: "NOT_ALLOWED",
      statementText: CONSENT_STATEMENT,
      householdConsentId: consent.id,
    });
    return { status: "DECLINED" as const };
  }

  await updateHouseholdConsent(consent.id, {
    status: "VERIFIED",
    verifiedAt: new Date(),
    verificationIpHash: input.ipHash,
    verificationUserAgentHash: input.userAgentHash,
  });
  await updateProfileConsentStatus(consent.profileId, "EXPLICIT_CONSENT_OBTAINED");
  await updateHouseholdMemberStatus(consent.householdMemberId, "ACTIVE");
  await appendConsentRecord({
    profileId: consent.profileId,
    actorUserId: consent.requestedByUserId,
    purpose: "PROFILE_MANAGEMENT",
    method: "DOUBLE_OPT_IN_EMAIL",
    status: "EXPLICIT_CONSENT_OBTAINED",
    statementText: CONSENT_STATEMENT,
    householdConsentId: consent.id,
  });
  return { status: "VERIFIED" as const };
}

export { CONSENT_STATEMENT };
