import { createNotificationInTx } from "./notifications";
import { randomUUID } from "node:crypto";
import { AppError, NotFoundError } from "@/lib/core/errors";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import {
  CONSENT_STATEMENT,
  type HouseholdDecisionInput,
  type HouseholdInvitationInput,
} from "@/lib/household/validation";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { encryptedProfileFields } from "@/lib/profiles/fields";
import { profileIdentityDigest } from "@/lib/requests/envelope";
import { blindIndex, decryptField, encryptField, sha256Hex } from "@/lib/security/crypto";
import { maskIdentifier } from "@/lib/security/masking";
import { lockActiveAccount } from "./access";
import { appendConsentRecordInTx } from "./consent";
import { revokeProfileConsentInTx } from "./profileConsent";
import { syncPrimaryIdentifiersInTx } from "./profileIdentifiers";

async function createInvitationInTx(
  tx: PrismaTransaction,
  actor: ActorContext,
  profile: {
    id: string;
    legalNameBi: string | null;
    contactEmailBi: string | null;
    countryCode: string;
    region: string | null;
    residencyConfirmed: boolean;
  },
  memberId: string,
  email: string,
  tokenHash: string
) {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  const latest = await tx.householdConsent.findFirst({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const consent = await tx.householdConsent.create({
    data: {
      id,
      householdMemberId: memberId,
      profileId: profile.id,
      requestedByUserId: actor.userId,
      contactEmailEnc: encryptField(email, {
        table: "HouseholdConsent",
        column: "contactEmailEnc",
        recordId: id,
      }),
      contactEmailBi: blindIndex(email, "household:email", "email"),
      contactEmailMasked: maskIdentifier("EMAIL", email),
      tokenHash,
      statementText: CONSENT_STATEMENT,
      statementHash: sha256Hex(CONSENT_STATEMENT),
      scope: { profileDigest: profileIdentityDigest(profile), version: 1 },
      expiresAt,
      createdAt: new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1)),
    },
  });
  await tx.householdMember.update({
    where: { id: memberId },
    data: {
      status: "PENDING",
      revokedAt: null,
      invitedEmailEnc: encryptField(email, {
        table: "HouseholdMember",
        column: "invitedEmailEnc",
        recordId: memberId,
      }),
      invitedEmailBi: blindIndex(email, "household:email", "email"),
      invitedEmailMasked: maskIdentifier("EMAIL", email),
    },
  });
  await tx.userProfile.update({
    where: { id: profile.id },
    data: { consentStatus: "PENDING_CONSENT" },
  });
  return { profileId: profile.id, memberId, consentId: consent.id, email, expiresAt };
}

export async function createAdultInvitation(
  actor: ActorContext,
  input: HouseholdInvitationInput,
  tokenHash: string
) {
  requirePermission(actor, "household:manage", { ownerUserId: actor.userId });
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, actor.userId);
    const count = await tx.householdMember.count({
      where: { ownerUserId: actor.userId, deletedAt: null },
    });
    if (count >= 20)
      throw new AppError({
        code: "VALIDATION_FAILED",
        message:
          "This instance supports up to 20 household adults per account. Remove an unused profile before adding another.",
      });
    const duplicate = await tx.userProfile.findFirst({
      where: {
        ownerUserId: actor.userId,
        kind: "HOUSEHOLD_ADULT",
        deletedAt: null,
        legalNameBi: blindIndex(input.profile.legalName, "profile:legalName", "text"),
        contactEmailBi: blindIndex(input.profile.contactEmail, "profile:email", "email"),
      },
      select: { id: true },
    });
    if (duplicate)
      throw new AppError({
        code: "CONFLICT",
        message:
          "This adult already has a household profile. Use Send new invitation on that profile if needed.",
      });
    const profileId = randomUUID();
    const profile = await tx.userProfile.create({
      data: {
        id: profileId,
        ...encryptedProfileFields(profileId, input.profile),
        ownerUserId: actor.userId,
        kind: "HOUSEHOLD_ADULT",
        consentStatus: "PENDING_CONSENT",
        createdById: actor.userId,
      },
    });
    await syncPrimaryIdentifiersInTx(tx, actor, profile.id, input.profile);
    const member = await tx.householdMember.create({
      data: {
        id: randomUUID(),
        ownerUserId: actor.userId,
        profileId,
        relationship: input.relationship,
        createdById: actor.userId,
      },
    });
    return createInvitationInTx(
      tx,
      actor,
      profile,
      member.id,
      input.profile.contactEmail,
      tokenHash
    );
  });
}

export async function resendAdultInvitation(
  actor: ActorContext,
  memberId: string,
  tokenHash: string
) {
  return prisma.$transaction(async (tx) => {
    const ref = await tx.householdMember.findFirst({
      where: { id: memberId, deletedAt: null },
      select: { ownerUserId: true },
    });
    if (!ref) throw new NotFoundError();
    requirePermission(actor, "household:manage", { ownerUserId: ref.ownerUserId });
    await lockActiveAccount(tx, ref.ownerUserId);
    const member = await tx.householdMember.findFirst({
      where: { id: memberId, deletedAt: null, profile: { deletedAt: null } },
      include: { profile: true },
    });
    if (
      !member?.profile.contactEmailEnc ||
      !member.profile.legalNameEnc ||
      !member.profile.residencyConfirmed
    )
      throw new AppError({
        code: "CONFLICT",
        message:
          "Edit this profile and add its legal name, contact email and residence before inviting it again.",
      });
    await revokeProfileConsentInTx(
      tx,
      member.profileId,
      actor.userId,
      "A new household invitation replaced previous permission. New approval is required after acceptance."
    );
    const email = decryptField(member.profile.contactEmailEnc, {
      table: "UserProfile",
      column: "contactEmailEnc",
      recordId: member.profileId,
    });
    return createInvitationInTx(tx, actor, member.profile, member.id, email, tokenHash);
  });
}

export async function revokeAdultConsent(actor: ActorContext, memberId: string) {
  return prisma.$transaction(async (tx) => {
    const ref = await tx.householdMember.findFirst({
      where: { id: memberId, deletedAt: null },
      select: { ownerUserId: true, profileId: true },
    });
    if (!ref) throw new NotFoundError();
    requirePermission(actor, "household:manage", { ownerUserId: ref.ownerUserId });
    await lockActiveAccount(tx, ref.ownerUserId);
    await revokeProfileConsentInTx(
      tx,
      ref.profileId,
      ref.ownerUserId,
      "The account holder withdrew household permission. New requests and queued sends are blocked."
    );
  });
}

export async function decideInvitationRecord(input: HouseholdDecisionInput) {
  return prisma.$transaction(async (tx) => {
    const ref = await tx.householdConsent.findUnique({
      where: { tokenHash: sha256Hex(input.token) },
      select: { requestedByUserId: true, profileId: true },
    });
    if (!ref) throw new NotFoundError("This invitation does not exist.");
    await lockActiveAccount(tx, ref.requestedByUserId);
    await tx.$executeRaw`SELECT 1 FROM "UserProfile" WHERE id = ${ref.profileId} FOR UPDATE`;
    const consent = await tx.householdConsent.findUniqueOrThrow({
      where: { tokenHash: sha256Hex(input.token) },
      include: { profile: true, householdMember: true },
    });
    if (consent.profile.deletedAt || consent.householdMember.deletedAt)
      throw new NotFoundError();
    const scope = consent.scope as { profileDigest?: string };
    if (input.decision === "revoke") {
      if (consent.status !== "VERIFIED")
        throw new AppError({
          code: "CONSENT_INVALID",
          message: "This invitation does not grant active permission.",
        });
      await revokeProfileConsentInTx(
        tx,
        consent.profileId,
        consent.requestedByUserId,
        "The represented adult withdrew household permission. New requests and queued sends are blocked."
      );
      return { status: "REVOKED" as const, consentId: consent.id };
    }
    if (consent.status !== "PENDING")
      throw new AppError({
        code: "CONSENT_INVALID",
        message: "This invitation has already been used or revoked.",
      });
    if (consent.expiresAt.getTime() <= Date.now()) {
      await tx.householdConsent.update({
        where: { id: consent.id },
        data: { status: "EXPIRED" },
      });
      return { status: "EXPIRED" as const, consentId: consent.id };
    }
    if (scope.profileDigest !== profileIdentityDigest(consent.profile))
      throw new AppError({
        code: "CONSENT_INVALID",
        message:
          "The profile details changed. Ask the account holder for a new invitation.",
      });
    const accepted = input.decision === "agree";
    const status = accepted ? ("VERIFIED" as const) : ("DECLINED" as const);
    await tx.householdConsent.update({
      where: { id: consent.id },
      data: {
        status,
        ...(accepted ? { verifiedAt: new Date() } : { declinedAt: new Date() }),
        verificationIpHash: input.ipHash,
        verificationUserAgentHash: input.userAgentHash,
      },
    });
    await tx.userProfile.update({
      where: { id: consent.profileId },
      data: {
        consentStatus: accepted ? "EXPLICIT_CONSENT_OBTAINED" : "NOT_ALLOWED",
        ...(accepted ? { onboardingCompletedAt: new Date() } : {}),
      },
    });
    await tx.householdMember.update({
      where: { id: consent.householdMemberId },
      data: {
        status: accepted ? "ACTIVE" : "REVOKED",
        revokedAt: accepted ? null : new Date(),
      },
    });
    await appendConsentRecordInTx(tx, {
      profileId: consent.profileId,
      actorUserId: consent.requestedByUserId,
      purpose: "PROFILE_MANAGEMENT",
      method: "DOUBLE_OPT_IN_EMAIL",
      status: accepted ? "EXPLICIT_CONSENT_OBTAINED" : "NOT_ALLOWED",
      statementText: consent.statementText,
      householdConsentId: consent.id,
      evidence: { profileDigest: scope.profileDigest, decision: input.decision },
    });
    await createNotificationInTx(tx, {
      userId: consent.requestedByUserId,
      profileId: consent.profileId,
      type: "HOUSEHOLD_CONSENT_UPDATE",
      title: accepted ? "Household invitation accepted" : "Household invitation declined",
      body: accepted
        ? "The adult confirmed permission. Review each request before sending."
        : "No requests can be prepared or sent for this profile.",
      actionUrl: "/household",
      dedupeKey: `household-decision:${consent.id}`,
    });
    return { status, consentId: consent.id };
  });
}

export async function readPublicInvitation(tokenHash: string) {
  const consent = await prisma.householdConsent.findUnique({
    where: { tokenHash },
    select: {
      status: true,
      statementText: true,
      contactEmailMasked: true,
      expiresAt: true,
      scope: true,
      requestedBy: { select: { status: true, deletionRequestedAt: true } },
      householdMember: { select: { deletedAt: true } },
      profile: {
        select: {
          deletedAt: true,
          legalNameBi: true,
          contactEmailBi: true,
          countryCode: true,
          region: true,
          residencyConfirmed: true,
        },
      },
    },
  });
  if (
    !consent ||
    consent.requestedBy.status !== "ACTIVE" ||
    consent.requestedBy.deletionRequestedAt ||
    consent.profile.deletedAt ||
    consent.householdMember.deletedAt
  )
    return null;
  const matches =
    (consent.scope as { profileDigest?: string }).profileDigest ===
    profileIdentityDigest(consent.profile);
  const status = !matches
    ? "REVOKED"
    : consent.status === "PENDING" && consent.expiresAt.getTime() <= Date.now()
      ? "EXPIRED"
      : consent.status;
  return {
    status,
    statementText: consent.statementText,
    contactEmailMasked: consent.contactEmailMasked,
    expiresAt: consent.expiresAt,
    countryCode: consent.profile.countryCode,
    region: consent.profile.region,
  };
}
