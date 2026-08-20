/**
 * Household members and double opt-in consent rows.
 */
import type {
  HouseholdConsentStatus,
  HouseholdMemberStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";

export async function listHouseholdForOwner(actor: ActorContext) {
  requirePermission(actor, "household:read", { ownerUserId: actor.userId });
  return prisma.householdMember.findMany({
    where: { ownerUserId: actor.userId, deletedAt: null },
    include: {
      profile: true,
      consents: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function createHouseholdConsent(data: Prisma.HouseholdConsentCreateInput) {
  return prisma.householdConsent.create({ data });
}

export async function findHouseholdConsentByTokenHash(tokenHash: string) {
  return prisma.householdConsent.findUnique({
    where: { tokenHash },
    include: {
      profile: true,
      householdMember: true,
      requestedBy: { select: { id: true, name: true } },
    },
  });
}

export async function updateHouseholdConsent(
  id: string,
  data: Prisma.HouseholdConsentUpdateInput
) {
  return prisma.householdConsent.update({ where: { id }, data });
}

export async function updateHouseholdMemberStatus(
  memberId: string,
  status: HouseholdMemberStatus
) {
  return prisma.householdMember.update({
    where: { id: memberId },
    data: { status, ...(status === "REVOKED" ? { revokedAt: new Date() } : {}) },
  });
}

export async function updateProfileConsentStatus(
  profileId: string,
  consentStatus: "EXPLICIT_CONSENT_OBTAINED" | "NOT_ALLOWED" | "PENDING_CONSENT"
) {
  return prisma.userProfile.update({
    where: { id: profileId },
    data: { consentStatus },
  });
}

export async function softDeleteHouseholdMember(actor: ActorContext, memberId: string) {
  requirePermission(actor, "household:manage", { ownerUserId: actor.userId });
  const member = await prisma.householdMember.findFirst({
    where: { id: memberId, ownerUserId: actor.userId, deletedAt: null },
  });
  if (!member) {
    throw new NotFoundError("This household member does not exist.");
  }
  await prisma.householdMember.update({
    where: { id: memberId },
    data: { deletedAt: new Date(), status: "REVOKED", revokedAt: new Date() },
  });
  await prisma.userProfile.update({
    where: { id: member.profileId },
    data: { deletedAt: new Date(), consentStatus: "NOT_ALLOWED" },
  });
  return member;
}

export async function listConsentRecordsForProfile(
  actor: ActorContext,
  profileId: string
) {
  requirePermission(actor, "consent:read", { ownerUserId: actor.userId });
  return prisma.consentRecord.findMany({
    where: { profileId },
    orderBy: { createdAt: "asc" },
  });
}

export type { HouseholdConsentStatus };
