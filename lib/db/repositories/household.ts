/**
 * Household members and double opt-in consent rows.
 */
import type { HouseholdConsentStatus } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { isCrossAccountAccess, requirePermission } from "@/lib/permissions/policy";
import { recordAuditOrThrow } from "@/lib/audit/service";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";

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
  const id = parseWithSchema(entityIdSchema, profileId);
  const available = {
    id,
    deletedAt: null,
    owner: { status: "ACTIVE" as const, deletionRequestedAt: null },
  };
  const profile = await prisma.userProfile.findFirst({
    where: available,
    select: { ownerUserId: true },
  });
  if (!profile) throw new NotFoundError();
  requirePermission(actor, "consent:read", { ownerUserId: profile.ownerUserId });
  const where = {
    profileId: id,
    profile: { ...available, ownerUserId: profile.ownerUserId },
  };
  if (isCrossAccountAccess(actor, { ownerUserId: profile.ownerUserId })) {
    await recordAuditOrThrow({
      actor,
      action: "admin.user_data_viewed",
      resourceType: "consent_record",
      resourceId: id,
      targetUserId: profile.ownerUserId,
    });
    const rows = await prisma.consentRecord.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        profileId: true,
        purpose: true,
        method: true,
        status: true,
        grantedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      statementText: "Restricted consent proof",
      evidenceJson: {},
    }));
  }
  return prisma.consentRecord.findMany({ where, orderBy: { createdAt: "asc" } });
}

export type { HouseholdConsentStatus };
