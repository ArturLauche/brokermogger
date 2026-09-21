/**
 * Ownership-scoped profile and identifier persistence.
 */
import type {
  ConsentStatus,
  HouseholdRelationship,
  IdentifierType,
  ProfileKind,
} from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { NotFoundError } from "@/lib/core/errors";
import { isCrossAccountAccess, requirePermission } from "@/lib/permissions/policy";
import type { ActorContext } from "@/lib/permissions/actor";
import { recordAudit, recordAuditOrThrow } from "@/lib/audit/service";
import { blindIndex, decryptField, encryptField } from "@/lib/security/crypto";
import { maskIdentifier } from "@/lib/security/masking";
import { eraseProfileContent } from "./profileErasure";

export async function listProfilesForActor(actor: ActorContext) {
  requirePermission(actor, "profile:read", { ownerUserId: actor.userId });
  return prisma.userProfile.findMany({
    where: { ownerUserId: actor.userId, deletedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}

export async function getOwnedProfile(actor: ActorContext, profileId: string) {
  const profile = await prisma.userProfile.findFirst({
    where: { id: profileId, deletedAt: null },
    include: {
      identifiers: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } },
      householdMember: {
        include: { consents: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
  });

  if (!profile) {
    throw new NotFoundError("This profile does not exist.");
  }

  requirePermission(actor, "profile:read", {
    ownerUserId: profile.ownerUserId,
    scope: `user:${profile.ownerUserId}`,
  });

  if (isCrossAccountAccess(actor, { ownerUserId: profile.ownerUserId })) {
    await recordAuditOrThrow({
      actor,
      action: "admin.user_data_viewed",
      resourceType: "profile",
      resourceId: profile.id,
      targetUserId: profile.ownerUserId,
    });
    return {
      ...profile,
      displayName: "Private profile",
      legalNameEnc: null,
      legalNameBi: null,
      contactEmailEnc: null,
      contactEmailBi: null,
      identifiers: profile.identifiers.map((identifier) => ({
        ...identifier,
        valueEnc: "",
        valueBi: "",
        label: null,
      })),
      householdMember: null,
    };
  }

  return profile;
}

export async function createSelfProfile(
  actor: ActorContext,
  input: {
    displayName: string;
    legalName: string;
    countryCode: string;
    region: string | null;
    residencyConfirmed: boolean;
    contactEmail: string;
  }
) {
  requirePermission(actor, "profile:create", { ownerUserId: actor.userId });

  const existing = await prisma.userProfile.findFirst({
    where: { ownerUserId: actor.userId, kind: "SELF", deletedAt: null },
    select: { id: true },
  });

  const created = await prisma.userProfile.create({
    data: {
      ownerUserId: actor.userId,
      kind: "SELF",
      displayName: input.displayName,
      countryCode: input.countryCode,
      region: input.region,
      residencyConfirmed: input.residencyConfirmed,
      consentStatus: "SELF",
      isPrimary: !existing,
      createdById: actor.userId,
      contactEmailMasked: null,
    },
  });

  const legalNameEnc = encryptField(input.legalName, {
    table: "UserProfile",
    column: "legalNameEnc",
    recordId: created.id,
  });
  const contactEmailEnc = encryptField(input.contactEmail, {
    table: "UserProfile",
    column: "contactEmailEnc",
    recordId: created.id,
  });

  const updated = await prisma.userProfile.update({
    where: { id: created.id },
    data: {
      legalNameEnc,
      legalNameBi: blindIndex(input.legalName, "profile:legalName", "text"),
      contactEmailEnc,
      contactEmailBi: blindIndex(input.contactEmail, "profile:email", "email"),
      contactEmailMasked: maskIdentifier("EMAIL", input.contactEmail),
    },
  });

  return updated;
}

export async function addIdentifier(
  actor: ActorContext,
  profileId: string,
  input: { type: IdentifierType; value: string; label?: string; isPrimary?: boolean }
) {
  const profile = await getOwnedProfile(actor, profileId);
  requirePermission(actor, "identifier:write", { ownerUserId: profile.ownerUserId });

  const created = await prisma.profileIdentifier.create({
    data: {
      profileId,
      type: input.type,
      ...(input.label ? { label: input.label } : {}),
      valueEnc: "pending",
      valueBi: blindIndex(input.value, `identifier:${input.type}`, indexType(input.type)),
      maskedPreview: maskIdentifier(input.type, input.value),
      isPrimary: input.isPrimary ?? false,
      createdById: actor.userId,
    },
  });

  const valueEnc = encryptField(input.value, {
    table: "ProfileIdentifier",
    column: "valueEnc",
    recordId: created.id,
  });

  return prisma.profileIdentifier.update({
    where: { id: created.id },
    data: { valueEnc },
  });
}

export async function markOnboardingComplete(actor: ActorContext, profileId: string) {
  await getOwnedProfile(actor, profileId);
  return prisma.userProfile.update({
    where: { id: profileId },
    data: { onboardingCompletedAt: new Date(), updatedById: actor.userId },
  });
}

export async function revealOwnedIdentifier(actor: ActorContext, identifierId: string) {
  const identifier = await prisma.profileIdentifier.findFirst({
    where: { id: identifierId, deletedAt: null },
    include: { profile: true },
  });
  if (!identifier) {
    throw new NotFoundError("This identifier does not exist.");
  }
  requirePermission(actor, "identifier:reveal", {
    ownerUserId: identifier.profile.ownerUserId,
  });
  const value = decryptField(identifier.valueEnc, {
    table: "ProfileIdentifier",
    column: "valueEnc",
    recordId: identifier.id,
  });
  await recordAudit({
    actor,
    action: "identifier.revealed",
    resourceType: "identifier",
    resourceId: identifier.id,
  });
  return { id: identifier.id, type: identifier.type, value, label: identifier.label };
}

export async function softDeleteIdentifier(actor: ActorContext, identifierId: string) {
  const identifier = await prisma.profileIdentifier.findFirst({
    where: { id: identifierId, deletedAt: null },
    include: { profile: true },
  });
  if (!identifier) {
    throw new NotFoundError("This identifier does not exist.");
  }
  requirePermission(actor, "identifier:write", {
    ownerUserId: identifier.profile.ownerUserId,
  });
  await eraseProfileContent(actor, identifier.profileId, identifierId);
  await recordAudit({
    actor,
    action: "identifier.deleted",
    resourceType: "identifier",
    resourceId: identifier.id,
  });
}

export async function softDeleteProfile(actor: ActorContext, profileId: string) {
  const profile = await getOwnedProfile(actor, profileId);
  requirePermission(actor, "profile:delete", { ownerUserId: profile.ownerUserId });
  await eraseProfileContent(actor, profileId);
  await recordAudit({
    actor,
    action: "profile.deleted",
    resourceType: "profile",
    resourceId: profileId,
  });
}

export async function createHouseholdAdult(
  actor: ActorContext,
  input: {
    displayName: string;
    legalName: string;
    countryCode: string;
    region: string | null;
    residencyConfirmed: boolean;
    invitedEmail: string;
    relationship: HouseholdRelationship;
  }
) {
  requirePermission(actor, "household:manage", { ownerUserId: actor.userId });

  const profile = await prisma.userProfile.create({
    data: {
      ownerUserId: actor.userId,
      kind: "HOUSEHOLD_ADULT" satisfies ProfileKind,
      displayName: input.displayName,
      countryCode: input.countryCode,
      region: input.region,
      residencyConfirmed: input.residencyConfirmed,
      consentStatus: "PENDING_CONSENT" satisfies ConsentStatus,
      isPrimary: false,
      createdById: actor.userId,
    },
  });

  await prisma.userProfile.update({
    where: { id: profile.id },
    data: {
      legalNameEnc: encryptField(input.legalName, {
        table: "UserProfile",
        column: "legalNameEnc",
        recordId: profile.id,
      }),
      legalNameBi: blindIndex(input.legalName, "profile:legalName", "text"),
    },
  });

  const member = await prisma.householdMember.create({
    data: {
      ownerUserId: actor.userId,
      profileId: profile.id,
      relationship: input.relationship,
      status: "PENDING",
      invitedEmailEnc: encryptField(input.invitedEmail, {
        table: "HouseholdMember",
        column: "invitedEmailEnc",
        recordId: profile.id,
      }),
      invitedEmailBi: blindIndex(input.invitedEmail, "household:email", "email"),
      invitedEmailMasked: maskIdentifier("EMAIL", input.invitedEmail),
      createdById: actor.userId,
    },
  });

  return { profile, member };
}

function indexType(type: IdentifierType): "email" | "phone" | "text" {
  if (type === "EMAIL") return "email";
  if (type === "PHONE") return "phone";
  return "text";
}
