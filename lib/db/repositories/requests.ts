/**
 * Ownership-scoped removal request persistence, including append-only events
 * and immutable snapshots.
 */
import type {
  ActorType,
  Prisma,
  RequestEventType,
  RequestStatus,
  RequestType,
} from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { AppError, NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { assertTransition, type TransitionActor } from "@/lib/requests/stateMachine";
import { canonicalJson, chainHash, sha256Hex } from "@/lib/security/crypto";

export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 200;

function clampTake(take: number | undefined): number {
  return Math.min(Math.max(take ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
}

export async function getOwnedRequest(actor: ActorContext, requestId: string) {
  const request = await prisma.removalRequest.findFirst({
    where: { id: requestId, deletedAt: null },
    include: {
      broker: { include: { contactMethods: true, jurisdictionCoverage: true } },
      profile: true,
      jurisdiction: true,
      snapshots: { orderBy: { version: "desc" }, take: 1 },
      events: { orderBy: { createdAt: "asc" } },
      legalRuleVersion: true,
      templateVersion: true,
      responses: { orderBy: { receivedAt: "asc" } },
      evidenceFiles: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!request) {
    throw new NotFoundError("This request does not exist.");
  }

  requirePermission(actor, "request:read", { ownerUserId: request.userId });
  return request;
}

export async function listOwnedRequests(
  actor: ActorContext,
  profileId: string | null,
  options: { take?: number } = {}
) {
  requirePermission(actor, "request:read", { ownerUserId: actor.userId });
  return prisma.removalRequest.findMany({
    where: {
      userId: actor.userId,
      deletedAt: null,
      ...(profileId ? { profileId } : {}),
    },
    include: { broker: true, profile: true, jurisdiction: true },
    orderBy: { updatedAt: "desc" },
    take: clampTake(options.take),
  });
}

const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_PAGES = 50;

/** Paginated account-export rows. Does not cap at the UI list limit. */
export async function listOwnedRequestExportRows(actor: ActorContext) {
  requirePermission(actor, "request:read", { ownerUserId: actor.userId });
  const rows: {
    id: string;
    status: RequestStatus;
    requestType: RequestType;
    createdAt: Date;
    broker: { legalName: string };
  }[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < EXPORT_MAX_PAGES; page += 1) {
    const batch = await prisma.removalRequest.findMany({
      where: { userId: actor.userId, deletedAt: null },
      select: {
        id: true,
        status: true,
        requestType: true,
        createdAt: true,
        broker: { select: { legalName: true } },
      },
      orderBy: { id: "asc" },
      take: EXPORT_PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    rows.push(...batch);
    if (batch.length < EXPORT_PAGE_SIZE) break;
    cursor = batch[batch.length - 1]?.id;
    if (!cursor) break;
  }

  return rows;
}

export interface RequestStatusCounts {
  total: number;
  byStatus: Map<RequestStatus, number>;
}

export async function summarizeOwnedRequests(
  actor: ActorContext,
  profileId: string | null
): Promise<RequestStatusCounts> {
  requirePermission(actor, "request:read", { ownerUserId: actor.userId });
  const groups = await prisma.removalRequest.groupBy({
    by: ["status"],
    where: {
      userId: actor.userId,
      deletedAt: null,
      ...(profileId ? { profileId } : {}),
    },
    _count: { _all: true },
  });

  const byStatus = new Map<RequestStatus, number>();
  let total = 0;
  for (const group of groups) {
    byStatus.set(group.status, group._count._all);
    total += group._count._all;
  }
  return { total, byStatus };
}

export async function countDistinctOwnedBrokers(
  actor: ActorContext,
  profileId: string | null
): Promise<number> {
  requirePermission(actor, "request:read", { ownerUserId: actor.userId });
  const groups = await prisma.removalRequest.groupBy({
    by: ["brokerId"],
    where: {
      userId: actor.userId,
      deletedAt: null,
      ...(profileId ? { profileId } : {}),
    },
  });
  return groups.length;
}

export async function createDraftRequest(data: Prisma.RemovalRequestCreateInput) {
  return prisma.removalRequest.create({ data });
}

export async function appendRequestEvent(input: {
  removalRequestId: string;
  type: RequestEventType;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus | null;
  actorType: ActorType;
  actorUserId: string | null;
  message: string | null;
  payload?: Record<string, unknown>;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      `brokermogger_request_events_${input.removalRequestId}`
    );

    const previous = await tx.removalRequestEvent.findFirst({
      where: { removalRequestId: input.removalRequestId },
      orderBy: { createdAt: "desc" },
      select: { hash: true },
    });

    const createdAt = new Date();
    const canonical = canonicalJson({
      removalRequestId: input.removalRequestId,
      type: input.type,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      message: input.message,
      payload: input.payload ?? {},
      createdAt,
    });
    const hash = chainHash(previous?.hash ?? null, canonical);

    return tx.removalRequestEvent.create({
      data: {
        removalRequestId: input.removalRequestId,
        type: input.type,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        message: input.message,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        prevHash: previous?.hash ?? null,
        hash,
        createdAt,
      },
    });
  });
}

export async function insertSnapshot(input: {
  removalRequestId: string;
  version: number;
  subject: string;
  body: string;
  templateVersionId: string | null;
  legalRuleVersionId: string | null;
  variables: Record<string, string>;
  identifierDigest: string;
  createdByUserId: string | null;
}) {
  const contentHash = sha256Hex(`${input.subject}\n${input.body}`);
  return prisma.requestSnapshot.create({
    data: {
      removalRequestId: input.removalRequestId,
      version: input.version,
      subject: input.subject,
      body: input.body,
      templateVersionId: input.templateVersionId,
      legalRuleVersionId: input.legalRuleVersionId,
      variables: input.variables,
      contentHash,
      identifierDigest: input.identifierDigest,
      createdByUserId: input.createdByUserId,
    },
  });
}

export async function patchRequest(
  requestId: string,
  data: Omit<Prisma.RemovalRequestUpdateInput, "status">
) {
  return prisma.removalRequest.update({
    where: { id: requestId },
    data: { ...data, lastEventAt: new Date() },
  });
}

/**
 * The only function allowed to write `RemovalRequest.status`. The current
 * status must still be `from` (optimistic concurrency) and the pair must pass
 * `assertTransition`.
 */
export async function applyRequestStatus(input: {
  requestId: string;
  from: RequestStatus;
  to: RequestStatus;
  actor: TransitionActor;
}): Promise<void> {
  assertTransition(input.from, input.to, input.actor);

  const extra: Prisma.RemovalRequestUpdateManyMutationInput = {};
  if (input.to === "CLOSED") extra.closedAt = new Date();
  if (input.to === "COMPLETED") extra.completedAt = new Date();
  if (input.to === "DELIVERED") extra.deliveredAt = new Date();

  const updated = await prisma.removalRequest.updateMany({
    where: { id: input.requestId, status: input.from, deletedAt: null },
    data: { status: input.to, lastEventAt: new Date(), ...extra },
  });

  if (updated.count !== 1) {
    throw new AppError({
      code: "CONFLICT",
      message: "This request changed. Reload and try again.",
      details: { from: input.from, to: input.to },
    });
  }
}

export async function countOpenRequests(userId: string, since: Date): Promise<number> {
  return prisma.removalRequest.count({
    where: { userId, createdAt: { gte: since }, deletedAt: null },
  });
}

export async function countRequestsForBroker(
  userId: string,
  brokerId: string,
  since: Date
): Promise<number> {
  return prisma.removalRequest.count({
    where: { userId, brokerId, createdAt: { gte: since }, deletedAt: null },
  });
}

export async function countRequestsForBrokers(
  userId: string,
  brokerIds: readonly string[],
  since: Date
): Promise<Map<string, number>> {
  if (brokerIds.length === 0) {
    return new Map();
  }

  const groups = await prisma.removalRequest.groupBy({
    by: ["brokerId"],
    where: {
      userId,
      brokerId: { in: [...brokerIds] },
      createdAt: { gte: since },
      deletedAt: null,
    },
    _count: { _all: true },
  });

  return new Map(groups.map((group) => [group.brokerId, group._count._all]));
}

export async function listRejectedBrokerIds(
  userId: string,
  brokerIds: readonly string[],
  requestType: RequestType
): Promise<Set<string>> {
  if (brokerIds.length === 0) {
    return new Set();
  }

  const rows = await prisma.removalRequest.findMany({
    where: {
      userId,
      brokerId: { in: [...brokerIds] },
      requestType,
      status: "REJECTED",
      deletedAt: null,
    },
    select: { brokerId: true },
    distinct: ["brokerId"],
  });

  return new Set(rows.map((row) => row.brokerId));
}

export async function listRequestsForUser(
  userId: string,
  profileId: string | null,
  range?: { from: Date; to: Date }
) {
  return prisma.removalRequest.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(profileId ? { profileId } : {}),
      ...(range ? { createdAt: { gte: range.from, lte: range.to } } : {}),
    },
    include: { broker: true, profile: true, jurisdiction: true },
    orderBy: { createdAt: "asc" },
    take: MAX_LIST_LIMIT,
  });
}

export async function hasRejectedSimilar(
  userId: string,
  brokerId: string,
  requestType: RequestType
): Promise<boolean> {
  const found = await prisma.removalRequest.findFirst({
    where: { userId, brokerId, requestType, status: "REJECTED", deletedAt: null },
    select: { id: true },
  });
  return found !== null;
}

export async function listUpcomingDeadlines(
  actor: ActorContext,
  profileId: string | null,
  take = 5
) {
  requirePermission(actor, "request:read", { ownerUserId: actor.userId });
  return prisma.removalRequest.findMany({
    where: {
      userId: actor.userId,
      deletedAt: null,
      deadlineAt: { gt: new Date() },
      ...(profileId ? { profileId } : {}),
    },
    include: { broker: true },
    orderBy: { deadlineAt: "asc" },
    take,
  });
}

export async function listRecentOwnedRequests(
  actor: ActorContext,
  profileId: string | null,
  take = 8
) {
  requirePermission(actor, "request:read", { ownerUserId: actor.userId });
  return prisma.removalRequest.findMany({
    where: {
      userId: actor.userId,
      deletedAt: null,
      ...(profileId ? { profileId } : {}),
    },
    include: { broker: true },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

const WAITING_FOR_DEADLINE: RequestStatus[] = [
  "SENT",
  "DELIVERED",
  "WAITING_FOR_BROKER",
  "FOLLOW_UP_SENT",
];

export async function listOverdueWaitingRequests(now: Date, take = 50) {
  return prisma.removalRequest.findMany({
    where: {
      deletedAt: null,
      status: { in: WAITING_FOR_DEADLINE },
      deadlineAt: { lte: now },
    },
    select: {
      id: true,
      userId: true,
      profileId: true,
      status: true,
      deadlineAt: true,
      followUpCount: true,
    },
    take,
  });
}

export async function listDeadlineWarningRequests(input: {
  now: Date;
  warningBefore: Date;
  take?: number;
}) {
  return prisma.removalRequest.findMany({
    where: {
      deletedAt: null,
      status: { in: WAITING_FOR_DEADLINE },
      deadlineAt: { gt: input.now, lte: input.warningBefore },
    },
    select: {
      id: true,
      userId: true,
      profileId: true,
      deadlineAt: true,
    },
    take: input.take ?? 50,
  });
}

export async function listClosedRequestsDueForRetention(cutoff: Date, take = 50) {
  return prisma.removalRequest.findMany({
    where: {
      status: "CLOSED",
      deletedAt: null,
      OR: [{ closedAt: { lte: cutoff } }, { closedAt: null, updatedAt: { lte: cutoff } }],
    },
    select: { id: true },
    take,
  });
}

export async function softDeleteClosedRequests(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await prisma.removalRequest.updateMany({
    where: { id: { in: [...ids] }, status: "CLOSED", deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count;
}
