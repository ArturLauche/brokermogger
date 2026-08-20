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
import { NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { canonicalJson, chainHash, sha256Hex } from "@/lib/security/crypto";

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

export async function listOwnedRequests(actor: ActorContext, profileId: string | null) {
  requirePermission(actor, "request:read", { ownerUserId: actor.userId });
  return prisma.removalRequest.findMany({
    where: {
      userId: actor.userId,
      deletedAt: null,
      ...(profileId ? { profileId } : {}),
    },
    include: { broker: true, profile: true, jurisdiction: true },
    orderBy: { updatedAt: "desc" },
  });
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

export async function updateRequestStatus(
  requestId: string,
  data: Prisma.RemovalRequestUpdateInput
) {
  return prisma.removalRequest.update({
    where: { id: requestId },
    data: { ...data, lastEventAt: new Date() },
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
