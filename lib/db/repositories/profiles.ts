import { randomUUID } from "node:crypto";
import {
  profileInputSchema,
  identifierInputSchema,
  type ProfileInput,
  type IdentifierInput,
} from "@/lib/profiles/validation";
import { encryptedProfileFields, encryptedIdentifierFields } from "@/lib/profiles/fields";
import { parseWithSchema } from "@/lib/validation/form";
import { profileIdentityDigest } from "@/lib/requests/envelope";
import {
  invalidateProfileApprovalsInTx,
  revokeProfileConsentInTx,
} from "./profileConsent";
import { lockActiveAccount } from "./access";
import { createIdentifierInTx, syncPrimaryIdentifiersInTx } from "./profileIdentifiers";
/**
 * Ownership-scoped profile and identifier persistence.
 */

import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { NotFoundError, AppError } from "@/lib/core/errors";
import { isCrossAccountAccess, requirePermission } from "@/lib/permissions/policy";
import type { ActorContext } from "@/lib/permissions/actor";
import { recordAudit, recordAuditOrThrow } from "@/lib/audit/service";
import { decryptField } from "@/lib/security/crypto";
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
  const data = parseWithSchema(profileInputSchema, input);
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, actor.userId);
    return createSelfProfileInTx(tx, actor, data);
  });
}

/** Internal transaction helper: the caller has locked the active account. */
export async function createSelfProfileInTx(
  tx: PrismaTransaction,
  actor: ActorContext,
  input: ProfileInput
) {
  const existing = await tx.userProfile.findFirst({
    where: { ownerUserId: actor.userId, kind: "SELF", deletedAt: null },
    select: { id: true },
  });
  const id = randomUUID();
  return tx.userProfile.create({
    data: {
      id,
      ...encryptedProfileFields(id, input),
      ownerUserId: actor.userId,
      kind: "SELF",
      consentStatus: "SELF",
      isPrimary: !existing,
      createdById: actor.userId,
    },
  });
}

export async function addIdentifier(
  actor: ActorContext,
  profileId: string,
  input: IdentifierInput
) {
  const data = parseWithSchema(identifierInputSchema, input);
  try {
    return await prisma.$transaction(async (tx) => {
      const ref = await tx.userProfile.findFirst({
        where: { id: profileId, deletedAt: null },
        select: { ownerUserId: true },
      });
      if (!ref) throw new NotFoundError();
      requirePermission(actor, "identifier:write", { ownerUserId: ref.ownerUserId });
      await lockActiveAccount(tx, ref.ownerUserId);
      const profile = await tx.userProfile.findFirst({
        where: { id: profileId, deletedAt: null },
        select: { id: true },
      });
      if (!profile) throw new NotFoundError();
      return createIdentifierInTx(tx, actor, profileId, data);
    });
  } catch (error) {
    throwIdentifierConflict(error);
  }
}

function throwIdentifierConflict(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  )
    throw new AppError({
      code: "CONFLICT",
      message: "This identifier is already stored on the profile.",
      details: { fieldErrors: { value: "This value already exists on this profile." } },
    });
  throw error;
}

export async function updateOwnedIdentifier(
  actor: ActorContext,
  identifierId: string,
  raw: unknown
) {
  const input = parseWithSchema(identifierInputSchema, raw);
  try {
    return await prisma.$transaction(async (tx) => {
      const ref = await tx.profileIdentifier.findFirst({
        where: { id: identifierId, deletedAt: null },
        select: { profile: { select: { ownerUserId: true } } },
      });
      if (!ref) throw new NotFoundError();
      requirePermission(actor, "identifier:write", {
        ownerUserId: ref.profile.ownerUserId,
      });
      await lockActiveAccount(tx, ref.profile.ownerUserId);
      const row = await tx.profileIdentifier.findFirst({
        where: { id: identifierId, deletedAt: null, profile: { deletedAt: null } },
      });
      if (!row) throw new NotFoundError();
      if (row.isPrimary && (row.type === "FULL_NAME" || row.type === "EMAIL"))
        throw new AppError({
          code: "CONFLICT",
          message: "Edit the profile to change its primary name or contact email.",
        });
      const updated = await tx.profileIdentifier.update({
        where: { id: identifierId, deletedAt: null, profile: { deletedAt: null } },
        data: {
          ...encryptedIdentifierFields(identifierId, input),
          isPrimary: row.isPrimary,
          updatedById: actor.userId,
        },
      });
      if (updated.valueBi !== row.valueBi || updated.type !== row.type)
        await invalidateProfileApprovalsInTx(
          tx,
          row.profileId,
          "A selected identifier changed. Regenerate the draft and approve it again.",
          identifierId
        );
      return updated;
    });
  } catch (error) {
    throwIdentifierConflict(error);
  }
}

export async function updateOwnedProfile(
  actor: ActorContext,
  profileId: string,
  raw: unknown
) {
  const input = parseWithSchema(profileInputSchema, raw);
  return prisma.$transaction(async (tx) => {
    const ref = await tx.userProfile.findFirst({
      where: { id: profileId, deletedAt: null },
      select: { ownerUserId: true },
    });
    if (!ref) throw new NotFoundError();
    requirePermission(actor, "profile:update", { ownerUserId: ref.ownerUserId });
    await lockActiveAccount(tx, ref.ownerUserId);
    const row = await tx.userProfile.findFirst({
      where: { id: profileId, deletedAt: null },
    });
    if (!row) throw new NotFoundError();
    const profile = await tx.userProfile.update({
      where: { id: profileId, deletedAt: null },
      data: { ...encryptedProfileFields(profileId, input), updatedById: actor.userId },
    });
    await syncPrimaryIdentifiersInTx(tx, actor, profileId, input);
    if (profileIdentityDigest(row) !== profileIdentityDigest(profile)) {
      if (row.kind === "HOUSEHOLD_ADULT")
        await revokeProfileConsentInTx(
          tx,
          profileId,
          actor.userId,
          "Household identity or residency details changed. A new invitation and approval are required."
        );
      else
        await invalidateProfileApprovalsInTx(
          tx,
          profileId,
          "Profile matching details changed. Regenerate the draft and approve it again."
        );
    }
    return profile;
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
  return {
    id: identifier.id,
    profileId: identifier.profileId,
    isPrimary: identifier.isPrimary,
    type: identifier.type,
    value,
    label: identifier.label,
  };
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
