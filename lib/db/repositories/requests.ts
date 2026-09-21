/**
 * Ownership-scoped removal request persistence, including append-only events
 * and immutable snapshots.
 */
import type {
  ActorType,
  JobType,
  Prisma,
  RequestEventType,
  RequestStatus,
  RequestType,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { AppError, NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { isCrossAccountAccess, requirePermission } from "@/lib/permissions/policy";
import { recordAuditOrThrow } from "@/lib/audit/service";
import { encryptSnapshotText, readSnapshotText } from "@/lib/requests/snapshot";
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
  if (isCrossAccountAccess(actor, { ownerUserId: request.userId })) {
    await recordAuditOrThrow({
      actor,
      action: "admin.user_data_viewed",
      resourceType: "removal_request",
      resourceId: request.id,
      targetUserId: request.userId,
    });
    return {
      ...request,
      snapshots: [],
      responses: [],
      evidenceFiles: [],
      profile: {
        ...request.profile,
        displayName: "Private profile",
        legalNameEnc: null,
        legalNameBi: null,
        contactEmailEnc: null,
        contactEmailBi: null,
      },
    };
  }
  return { ...request, snapshots: request.snapshots.map(readSnapshotText) };
}

/** Snapshot pinned at approval. Callers must not fall back to the latest version. */
export async function getSnapshotForRequest(
  actor: ActorContext,
  removalRequestId: string,
  snapshotId: string
) {
  const request = await prisma.removalRequest.findFirst({
    where: { id: removalRequestId, deletedAt: null },
    select: { userId: true },
  });
  if (!request) throw new NotFoundError("This request does not exist.");
  requirePermission(actor, "request:update", { ownerUserId: request.userId });
  const snapshot = await prisma.requestSnapshot.findFirst({
    where: { id: snapshotId, removalRequestId },
    select: {
      id: true,
      subject: true,
      body: true,
      contentHash: true,
      version: true,
      payloadEnc: true,
      erasedAt: true,
    },
  });
  return snapshot ? readSnapshotText(snapshot) : null;
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
/** Fail an account export rather than returning a silently truncated file. */
export const EXPORT_HARD_ROW_LIMIT = 250_000;
/** Visible report cap. Larger result sets are marked truncated in the report. */
export const REPORT_MAX_ROWS = 10_000;

async function paginateById<T extends { id: string }>(input: {
  loadPage: (cursor: string | undefined) => Promise<T[]>;
  maxRows: number;
  onCap: "throw" | "truncate";
}): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let cursor: string | undefined;

  while (rows.length < input.maxRows) {
    const batch = await input.loadPage(cursor);
    if (batch.length === 0) {
      return { rows, truncated: false };
    }

    const room = input.maxRows - rows.length;
    if (batch.length > room) {
      rows.push(...batch.slice(0, room));
      if (input.onCap === "throw") {
        throw new AppError({
          code: "INTERNAL_ERROR",
          message:
            "This account has too many requests to export as a single file. Contact the instance operator.",
          details: { limit: input.maxRows },
        });
      }
      return { rows, truncated: true };
    }

    rows.push(...batch);
    if (batch.length < EXPORT_PAGE_SIZE) {
      return { rows, truncated: false };
    }
    cursor = batch[batch.length - 1]?.id;
    if (!cursor) {
      return { rows, truncated: false };
    }
  }

  const peek = await input.loadPage(cursor);
  if (peek.length === 0) {
    return { rows, truncated: false };
  }
  if (input.onCap === "throw") {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message:
        "This account has too many requests to export as a single file. Contact the instance operator.",
      details: { limit: input.maxRows },
    });
  }
  return { rows, truncated: true };
}

/** Paginated account-export rows. Iterates until the cursor is exhausted. */
export async function listOwnedRequestExportRows(actor: ActorContext) {
  requirePermission(actor, "request:read", { ownerUserId: actor.userId });
  const { rows } = await paginateById({
    maxRows: EXPORT_HARD_ROW_LIMIT,
    onCap: "throw",
    loadPage: (cursor) =>
      prisma.removalRequest.findMany({
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
      }),
  });
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

export interface RequestEventInput {
  removalRequestId: string;
  type: RequestEventType;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus | null;
  actorType: ActorType;
  actorUserId: string | null;
  message: string | null;
  payload?: Record<string, unknown>;
}

async function lockRequestEventChain(
  tx: PrismaTransaction,
  requestId: string
): Promise<void> {
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    `brokermogger_request_events_${requestId}`
  );
}

export async function appendRequestEventInTx(
  tx: PrismaTransaction,
  input: RequestEventInput
) {
  const previous = await tx.removalRequestEvent.findFirst({
    where: { removalRequestId: input.removalRequestId },
    orderBy: { createdAt: "desc" },
    select: { hash: true, createdAt: true },
  });

  const createdAt = new Date(
    Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1)
  );
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
}

export async function appendRequestEvent(input: RequestEventInput) {
  return prisma.$transaction(async (tx) => {
    await lockRequestEventChain(tx, input.removalRequestId);
    return appendRequestEventInTx(tx, input);
  });
}

export interface SnapshotInput {
  removalRequestId: string;
  version: number;
  subject: string;
  body: string;
  templateVersionId: string | null;
  legalRuleVersionId: string | null;
  variables: Record<string, string>;
  identifierDigest: string;
  createdByUserId: string | null;
}

export async function insertSnapshot(
  input: SnapshotInput,
  tx: PrismaTransaction = prisma
) {
  const contentHash = sha256Hex(`${input.subject}\n${input.body}`);
  const id = randomUUID();
  return tx.requestSnapshot.create({
    data: {
      id,
      removalRequestId: input.removalRequestId,
      version: input.version,
      subject: "",
      body: "",
      payloadEnc: encryptSnapshotText(id, input.subject, input.body),
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
 * `assertTransition`. The matching hash-chained event is inserted in the same
 * transaction. Callers that also need to drop pending jobs (close, complete)
 * pass `cancelPendingJobTypes` so those rows are cancelled atomically.
 */
export async function applyRequestStatus(input: {
  requestId: string;
  from: RequestStatus;
  to: RequestStatus;
  actor: TransitionActor;
  actorUserId: string | null;
  message: string;
  cancelPendingJobTypes?: readonly JobType[];
}): Promise<void> {
  assertTransition(input.from, input.to, input.actor);

  const extra: Prisma.RemovalRequestUpdateManyMutationInput = {};
  if (input.to === "CLOSED") extra.closedAt = new Date();
  if (input.to === "COMPLETED") extra.completedAt = new Date();
  if (input.to === "DELIVERED") extra.deliveredAt = new Date();

  await prisma.$transaction(async (tx) => {
    await lockRequestEventChain(tx, input.requestId);

    const updated = await tx.removalRequest.updateMany({
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

    await appendRequestEventInTx(tx, {
      removalRequestId: input.requestId,
      type: "STATUS_CHANGE",
      fromStatus: input.from,
      toStatus: input.to,
      actorType: input.actor,
      actorUserId: input.actorUserId,
      message: input.message,
    });

    if (input.cancelPendingJobTypes && input.cancelPendingJobTypes.length > 0) {
      await tx.backgroundJob.updateMany({
        where: {
          relatedRequestId: input.requestId,
          type: { in: [...input.cancelPendingJobTypes] },
          status: { in: ["PENDING", "RETRYABLE"] },
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          lastError: "Cancelled because the request left a waiting state.",
          lockedAt: null,
          lockedBy: null,
          lockExpiresAt: null,
        },
      });
    }
  });
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
): Promise<{
  rows: Awaited<ReturnType<typeof loadRequestReportPage>>;
  truncated: boolean;
  maxRows: number;
}> {
  return paginateById({
    maxRows: REPORT_MAX_ROWS,
    onCap: "truncate",
    loadPage: (cursor) =>
      loadRequestReportPage({
        userId,
        profileId,
        ...(range ? { range } : {}),
        ...(cursor ? { cursor } : {}),
      }),
  }).then((result) => ({
    ...result,
    maxRows: REPORT_MAX_ROWS,
  }));
}

async function loadRequestReportPage(input: {
  userId: string;
  profileId: string | null;
  range?: { from: Date; to: Date };
  cursor?: string;
}) {
  return prisma.removalRequest.findMany({
    where: {
      userId: input.userId,
      deletedAt: null,
      ...(input.profileId ? { profileId: input.profileId } : {}),
      ...(input.range
        ? { createdAt: { gte: input.range.from, lte: input.range.to } }
        : {}),
    },
    include: { broker: true, profile: true, jurisdiction: true },
    orderBy: { id: "asc" },
    take: EXPORT_PAGE_SIZE,
    ...(input.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
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
    orderBy: { deadlineAt: "asc" },
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
      notifications: {
        none: { type: "DEADLINE_APPROACHING", emailedAt: { not: null } },
      },
    },
    select: {
      id: true,
      userId: true,
      profileId: true,
      deadlineAt: true,
    },
    orderBy: { deadlineAt: "asc" },
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

export async function countClosedRequestsDueForRetention(cutoff: Date): Promise<number> {
  return prisma.removalRequest.count({
    where: {
      status: "CLOSED",
      deletedAt: null,
      OR: [{ closedAt: { lte: cutoff } }, { closedAt: null, updatedAt: { lte: cutoff } }],
    },
  });
}

/** Soft-hides the parent row. Callers must purge snapshots/events first. */
export async function softDeleteClosedRequests(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await prisma.removalRequest.updateMany({
    where: { id: { in: [...ids] }, status: "CLOSED", deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count;
}
