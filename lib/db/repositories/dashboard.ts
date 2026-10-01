import { Prisma, type RequestStatus } from "@prisma/client";

import { NotFoundError } from "@/lib/core/errors";
import { prisma } from "@/lib/db/client";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import {
  NEEDS_USER_ACTION_STATUSES,
  WAITING_STATUSES,
} from "@/lib/requests/stateMachine";

const REQUEST_SUMMARY = {
  id: true,
  status: true,
  channel: true,
  requestType: true,
  updatedAt: true,
  deadlineAt: true,
  deadlineOn: true,
  deadlineIsEstimate: true,
  broker: { select: { legalName: true } },
} satisfies Prisma.RemovalRequestSelect;

/** Bounded lists and actual counts, from one consistent ownership-scoped snapshot. */
export async function getOwnedDashboard(
  actor: ActorContext,
  profileId: string | null,
  now = new Date()
) {
  requirePermission(actor, "request:read", { ownerUserId: actor.userId });
  return prisma.$transaction(
    async (tx) => {
      if (
        profileId &&
        !(await tx.userProfile.findFirst({
          where: { id: profileId, ownerUserId: actor.userId, deletedAt: null },
          select: { id: true },
        }))
      )
        throw new NotFoundError("This profile does not exist.");

      const where: Prisma.RemovalRequestWhereInput = {
        userId: actor.userId,
        deletedAt: null,
        profile: { deletedAt: null },
        ...(profileId ? { profileId } : {}),
      };
      const waiting: Prisma.RemovalRequestWhereInput = {
        ...where,
        status: { in: [...WAITING_STATUSES] },
        deadlineAt: { gt: now },
      };
      const [groups, brokers, upcomingCount, attention, upcoming, recent] =
        await Promise.all([
          tx.removalRequest.groupBy({ by: ["status"], where, _count: { _all: true } }),
          tx.$queryRaw<{ count: number }[]>(Prisma.sql`
        SELECT COUNT(DISTINCT r."brokerId")::int AS count
        FROM "RemovalRequest" r
        JOIN "UserProfile" p ON p.id = r."profileId"
        WHERE r."userId" = ${actor.userId} AND r."deletedAt" IS NULL AND p."deletedAt" IS NULL
        ${profileId ? Prisma.sql`AND r."profileId" = ${profileId}` : Prisma.empty}
      `),
          tx.removalRequest.count({ where: waiting }),
          tx.removalRequest.findMany({
            where: { ...where, status: { in: [...NEEDS_USER_ACTION_STATUSES] } },
            select: REQUEST_SUMMARY,
            orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
            take: 5,
          }),
          tx.removalRequest.findMany({
            where: waiting,
            select: REQUEST_SUMMARY,
            orderBy: [{ deadlineAt: "asc" }, { id: "asc" }],
            take: 5,
          }),
          tx.removalRequest.findMany({
            where,
            select: REQUEST_SUMMARY,
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 8,
          }),
        ]);
      return {
        total: groups.reduce((total, group) => total + group._count._all, 0),
        byStatus: new Map<RequestStatus, number>(
          groups.map((group) => [group.status, group._count._all])
        ),
        brokerCount: brokers[0]?.count ?? 0,
        upcomingCount,
        attention,
        upcoming,
        recent,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}
