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
import {
  sealApprovalEnvelope,
  profileIdentityDigest,
  identifierDigest,
} from "@/lib/requests/envelope";
import { randomUUID } from "node:crypto";

import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { AppError, NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { isCrossAccountAccess, requirePermission } from "@/lib/permissions/policy";
import { recordAuditOrThrow } from "@/lib/audit/service";
import { encryptSnapshotText, readSnapshotText } from "@/lib/requests/snapshot";
import { assertTransition, type TransitionActor } from "@/lib/requests/stateMachine";
import { canonicalJson, chainHash, sha256Hex } from "@/lib/security/crypto";
import { sendingIdentityInTx } from "./inboundMailboxes";

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
      templateVersion: { include: { template: { select: { requestType: true } } } },
      responses: {
        where: { deletedAt: null },
        orderBy: { receivedAt: "desc" },
        take: 25,
        select: {
          id: true,
          receivedAt: true,
          receivedOn: true,
          classification: true,
          confirmedAt: true,
          deletedAt: true,
        },
      },
      _count: { select: { responses: { where: { deletedAt: null } } } },
      manualSubmissions: { orderBy: { createdAt: "desc" } },
      outboundEmails: {
        where: {
          dispatchState: { in: ["DISPATCHING", "AMBIGUOUS", "RECONCILIATION_REQUIRED"] },
        },
        select: {
          id: true,
          snapshotId: true,
          dispatchStartedAt: true,
          dispatchState: true,
        },
        orderBy: { createdAt: "desc" },
      },
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
      manualSubmissions: [],
      outboundEmails: [],
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
  await tx.$executeRaw`SELECT 1 FROM "RemovalRequest" WHERE id = ${requestId} FOR UPDATE`;
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
  profileDigest: string;
  createdByUserId: string | null;
}

export async function insertSnapshot(
  input: SnapshotInput,
  tx: PrismaTransaction = prisma
) {
  const contentHash = sha256Hex(`${input.subject}\n${input.body}`);
  const id = randomUUID();
  const request = await tx.removalRequest.findUniqueOrThrow({
    where: { id: input.removalRequestId },
    include: {
      profile: {
        select: {
          legalNameBi: true,
          contactEmailBi: true,
          countryCode: true,
          region: true,
          residencyConfirmed: true,
        },
      },
    },
  });
  const identifiers = await tx.profileIdentifier.findMany({
    where: {
      profileId: request.profileId,
      id: { in: request.includedIdentifierIds },
      deletedAt: null,
    },
    select: { id: true, valueBi: true },
  });
  if (
    input.profileDigest !== profileIdentityDigest(request.profile) ||
    input.identifierDigest !== identifierDigest(identifiers) ||
    identifiers.length !== request.includedIdentifierIds.length
  )
    throw new AppError({
      code: "CONFLICT",
      message:
        "Profile details or selected identifiers changed while preparing this draft. Regenerate it and try again.",
    });
  const envelope = sealApprovalEnvelope({
    version: 1,
    requestId: request.id,
    snapshotId: id,
    contentHash,
    profileId: request.profileId,
    brokerId: request.brokerId,
    jurisdictionId: request.jurisdictionId,
    requestType: request.requestType,
    channel: request.channel,
    destinationType: request.destinationType,
    destination: request.destinationValue,
    ...(await sendingIdentityInTx(tx, request.userId, true)),
    identifierIds: [...request.includedIdentifierIds].sort(),
    identifierDigest: input.identifierDigest,
    profileDigest: profileIdentityDigest(request.profile),
    templateVersionId: input.templateVersionId,
    legalRuleVersionId: input.legalRuleVersionId,
    followUpNumber: Number(input.variables.followUpNumber ?? request.followUpCount),
  });
  return tx.requestSnapshot.create({
    data: {
      id,
      removalRequestId: input.removalRequestId,
      version: input.version,
      subject: "",
      body: "",
      payloadEnc: encryptSnapshotText(id, input.subject, input.body),
      ...envelope,
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
  actor: ActorContext,
  requestId: string,
  data: { deliveredAt?: Date }
) {
  const ref = await prisma.removalRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: { userId: true },
  });
  requirePermission(actor, "request:update", { ownerUserId: ref.userId });
  return prisma.removalRequest.update({
    where: { id: requestId, deletedAt: null },
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
export interface StatusChangeInput {
  requestId: string;
  from: RequestStatus;
  to: RequestStatus;
  actor: TransitionActor;
  actorUserId: string | null;
  message: string;
  cancelPendingJobTypes?: readonly JobType[];
}

export async function applyRequestStatus(
  actor: ActorContext,
  input: Omit<StatusChangeInput, "actor" | "actorUserId">
): Promise<void> {
  if (input.to === "APPROVED")
    throw new AppError({
      code: "FORBIDDEN",
      message: "Approval must use the complete message review transaction.",
    });
  return prisma.$transaction(async (tx) => {
    const ref = await tx.removalRequest.findFirst({
      where: { id: input.requestId, deletedAt: null },
      select: { userId: true },
    });
    if (!ref) throw new NotFoundError();
    requirePermission(actor, "request:update", { ownerUserId: ref.userId });
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ref.userId} FOR UPDATE`;
    const active = await tx.user.findFirst({
      where: { id: ref.userId, status: "ACTIVE", deletionRequestedAt: null },
      select: { id: true },
    });
    if (!active)
      throw new AppError({ code: "FORBIDDEN", message: "This account is not active." });
    return applyRequestStatusInTx(tx, {
      ...input,
      actor: actor.isSystem ? "SYSTEM" : "USER",
      actorUserId: actor.isSystem ? null : actor.userId,
    });
  });
}

export async function applyRequestStatusInTx(
  tx: PrismaTransaction,
  input: StatusChangeInput
): Promise<void> {
  assertTransition(input.from, input.to, input.actor);

  const extra: Prisma.RemovalRequestUpdateManyMutationInput = {};
  if (["DRAFT", "AWAITING_USER_APPROVAL"].includes(input.to)) {
    // Keep the last historical approval timestamp for previously sent requests.
    // Dispatch authority is the current snapshot/hash/consent tuple, cleared here.
    extra.approvalConsentRecordId = null;
    extra.approvedSnapshotId = null;
    extra.approvedEnvelopeHash = null;
  }
  if (input.to === "CLOSED") extra.closedAt = new Date();
  if (input.to === "COMPLETED") extra.completedAt = new Date();
  if (input.to === "DELIVERED") extra.deliveredAt = new Date();

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
        status: { in: ["PENDING", "RETRYABLE", "RUNNING"] },
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        lastError: "Cancelled because the request left a waiting state.",
        lockedAt: null,
        lockedBy: null,
        lockExpiresAt: null,
        leaseToken: null,
      },
    });
    await tx.outboundEmail.updateMany({
      where: { removalRequestId: input.requestId, dispatchState: "PREPARED" },
      data: { dispatchState: "CANCELLED", dispatchToken: null },
    });
    await tx.outboundEmail.updateMany({
      where: {
        removalRequestId: input.requestId,
        dispatchState: { in: ["DISPATCHING", "AMBIGUOUS"] },
      },
      data: {
        dispatchState: "RECONCILIATION_REQUIRED",
        dispatchToken: null,
        lastError:
          "The request was closed after dispatch began. The provider may still deliver the message; accepted email cannot be recalled.",
      },
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

const WAITING_FOR_DEADLINE: RequestStatus[] = [
  "SENT",
  "DELIVERED",
  "WAITING_FOR_BROKER",
  "FOLLOW_UP_SENT",
];

export type DeadlineCursor = { deadlineAt: Date; id: string };
function afterResponseTarget(after?: DeadlineCursor): Prisma.RemovalRequestWhereInput {
  return after
    ? {
        OR: [
          { deadlineAt: { gt: after.deadlineAt } },
          { deadlineAt: after.deadlineAt, id: { gt: after.id } },
        ],
      }
    : {};
}
export async function listOverdueWaitingRequests(
  now: Date,
  take = 50,
  after?: DeadlineCursor
) {
  return prisma.removalRequest.findMany({
    where: {
      deletedAt: null,
      user: { status: "ACTIVE", deletionRequestedAt: null },
      profile: { deletedAt: null },
      OR: [
        { status: { in: WAITING_FOR_DEADLINE } },
        {
          status: "NO_RESPONSE",
          notifications: { none: { dedupeKey: { startsWith: "deadline-handled:" } } },
        },
      ],
      deadlineAt: { lte: now },
      AND: [afterResponseTarget(after)],
    },
    select: {
      id: true,
      userId: true,
      profileId: true,
      status: true,
      deadlineAt: true,
      followUpCount: true,
    },
    orderBy: [{ deadlineAt: "asc" }, { id: "asc" }],
    take: clampTake(take),
  });
}

export async function listDeadlineWarningRequests(input: {
  now: Date;
  warningBefore: Date;
  take?: number;
  after?: DeadlineCursor;
}) {
  return prisma.removalRequest.findMany({
    where: {
      deletedAt: null,
      user: { status: "ACTIVE", deletionRequestedAt: null },
      status: { in: WAITING_FOR_DEADLINE },
      deadlineAt: { gt: input.now, lte: input.warningBefore },
      OR: [
        { deadlineWarningForAt: null },
        {
          NOT: {
            deadlineWarningForAt: { equals: prisma.removalRequest.fields.deadlineAt },
          },
        },
      ],
      AND: [afterResponseTarget(input.after)],
    },
    select: {
      id: true,
      userId: true,
      profileId: true,
      deadlineAt: true,
    },
    orderBy: [{ deadlineAt: "asc" }, { id: "asc" }],
    take: clampTake(input.take ?? 50),
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
