/**
 * Household members and double opt-in consent rows.
 */
import type { HouseholdConsentStatus } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { isCrossAccountAccess, requirePermission } from "@/lib/permissions/policy";
import { recordAuditOrThrow } from "@/lib/audit/service";

export async function listHouseholdForOwner(actor: ActorContext) {
  requirePermission(actor, "household:read", { ownerUserId: actor.userId });
  const members = await prisma.householdMember.findMany({
    where: { ownerUserId: actor.userId, deletedAt: null },
    include: {
      profile: true,
      consents: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "asc" },
  });
  return members.map((member) => ({
    ...member,
    invitationExpired:
      member.consents[0]?.status === "PENDING" &&
      member.consents[0].expiresAt.getTime() <= Date.now(),
  }));
}

export async function getOwnedHouseholdMember(actor: ActorContext, memberId: string) {
  const member = await prisma.householdMember.findFirst({
    where: { id: memberId, deletedAt: null },
  });
  if (!member) throw new NotFoundError();
  requirePermission(actor, "household:manage", { ownerUserId: member.ownerUserId });
  return member;
}

export async function listConsentRecordsForProfile(
  actor: ActorContext,
  profileId: string
) {
  const profile = await prisma.userProfile.findFirst({
    where: { id: profileId, deletedAt: null },
    select: { ownerUserId: true },
  });
  if (!profile) throw new NotFoundError();
  requirePermission(actor, "consent:read", { ownerUserId: profile.ownerUserId });
  const rows = await prisma.consentRecord.findMany({
    where: { profileId },
    orderBy: { createdAt: "asc" },
  });
  if (isCrossAccountAccess(actor, { ownerUserId: profile.ownerUserId })) {
    await recordAuditOrThrow({
      actor,
      action: "admin.user_data_viewed",
      resourceType: "consent_record",
      resourceId: profileId,
      targetUserId: profile.ownerUserId,
    });
    return rows.map((row) => ({
      ...row,
      statementText: "Restricted consent proof",
      evidence: {},
    }));
  }
  return rows;
}

export type { HouseholdConsentStatus };
