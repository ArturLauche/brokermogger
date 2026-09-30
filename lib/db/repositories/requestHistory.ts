import { prisma } from "@/lib/db/client";
import { NotFoundError } from "@/lib/core/errors";
import { recordAuditOrThrow } from "@/lib/audit/service";
import { createdBeforeCursor, cursorPage, pageInputSchema } from "@/lib/pagination";
import type { ActorContext } from "@/lib/permissions/actor";
import { isCrossAccountAccess, requirePermission } from "@/lib/permissions/policy";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { requireOwnedRequestPrivate } from "./requests";

/** Public catalogue and operational state only. No private relation is selected. */
export async function getRequestAccessSummary(actor: ActorContext, rawId: unknown) {
  const id = parseWithSchema(entityIdSchema, rawId);
  const owner = await prisma.removalRequest.findFirst({
    where: { id, deletedAt: null },
    select: { userId: true },
  });
  if (!owner) throw new NotFoundError("This request does not exist.");
  requirePermission(actor, "request:read", { ownerUserId: owner.userId });
  const emergencyRead = isCrossAccountAccess(actor, { ownerUserId: owner.userId });
  if (emergencyRead)
    await recordAuditOrThrow({
      actor,
      action: "admin.user_data_viewed",
      resourceType: "removal_request",
      resourceId: id,
      targetUserId: owner.userId,
    });
  const request = await prisma.removalRequest.findFirst({
    where: { id, userId: owner.userId, deletedAt: null },
    select: {
      id: true,
      status: true,
      requestType: true,
      channel: true,
      createdAt: true,
      updatedAt: true,
      broker: { select: { legalName: true } },
      jurisdiction: { select: { name: true } },
    },
  });
  if (!request) throw new NotFoundError();
  return { request, emergencyRead };
}

export async function listRequestEvents(
  actor: ActorContext,
  requestId: string,
  raw: unknown = {}
) {
  const request = await requireOwnedRequestPrivate(actor, requestId);
  const input = parseWithSchema(pageInputSchema, raw);
  const where = { removalRequestId: request.id };
  const [rows, total] = await Promise.all([
    prisma.removalRequestEvent.findMany({
      where: { AND: [where, createdBeforeCursor(input.cursor)] },
      select: {
        id: true,
        createdAt: true,
        type: true,
        fromStatus: true,
        toStatus: true,
        actorType: true,
        message: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    }),
    prisma.removalRequestEvent.count({ where }),
  ]);
  return { ...cursorPage(rows, input.limit), total };
}

export async function listRequestSubmissions(
  actor: ActorContext,
  requestId: string,
  raw: unknown = {}
) {
  const request = await requireOwnedRequestPrivate(actor, requestId);
  const input = parseWithSchema(pageInputSchema, raw);
  const where = { removalRequestId: request.id };
  const [rows, total] = await Promise.all([
    prisma.manualSubmission.findMany({
      where: { AND: [where, createdBeforeCursor(input.cursor)] },
      select: {
        id: true,
        createdAt: true,
        submittedOn: true,
        receivedOn: true,
        evidenceFile: {
          select: {
            id: true,
            userId: true,
            storageState: true,
            expiresAt: true,
            deletedAt: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    }),
    prisma.manualSubmission.count({ where }),
  ]);
  const now = new Date();
  const page = cursorPage(rows, input.limit);
  return {
    ...page,
    total,
    items: page.items.map(({ evidenceFile, ...row }) => ({
      ...row,
      evidenceFileId:
        evidenceFile &&
        evidenceFile.userId === request.userId &&
        !evidenceFile.deletedAt &&
        evidenceFile.storageState === "READY" &&
        (!evidenceFile.expiresAt || evidenceFile.expiresAt > now)
          ? evidenceFile.id
          : null,
      unavailableEvidence:
        !!evidenceFile &&
        (evidenceFile.userId !== request.userId ||
          !!evidenceFile.deletedAt ||
          evidenceFile.storageState !== "READY" ||
          (!!evidenceFile.expiresAt && evidenceFile.expiresAt <= now)),
    })),
  };
}
