import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NotificationType, NotificationSeverity, type Prisma } from "@prisma/client";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { AppError, NotFoundError } from "@/lib/core/errors";
import { parseJobPayload } from "@/lib/jobs/payloads";
import {
  notificationPreferences,
  NOTIFICATION_EMAIL_NOTICE,
  notificationHref,
} from "@/lib/notifications/preferences";
import { pageInputSchema, createdBeforeCursor, cursorPage } from "@/lib/pagination";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { sha256Hex } from "@/lib/security/crypto";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { lockActiveAccount } from "./access";

const notificationInputSchema = z.object({
  userId: entityIdSchema,
  profileId: entityIdSchema.nullish(),
  removalRequestId: entityIdSchema.nullish(),
  type: z.enum(NotificationType),
  severity: z.enum(NotificationSeverity).default("INFO"),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  actionUrl: z
    .string()
    .refine((value) => notificationHref(value) !== null)
    .nullish(),
  dedupeKey: z.string().min(1).max(250),
});
export type NewNotification = z.input<typeof notificationInputSchema>;

/** Call inside an already-authorized transaction holding the owner's account lock. */
export async function createNotificationInTx(
  tx: PrismaTransaction,
  raw: NewNotification
) {
  const input = parseWithSchema(notificationInputSchema, raw);
  const user = await tx.user.findFirst({
    where: { id: input.userId, status: "ACTIVE", deletionRequestedAt: null },
    select: { preferences: true, emailVerified: true },
  });
  if (!user) return null;
  if (input.removalRequestId) {
    const request = await tx.removalRequest.findFirst({
      where: {
        id: input.removalRequestId,
        userId: input.userId,
        deletedAt: null,
        ...(input.profileId ? { profileId: input.profileId } : {}),
      },
      select: { id: true },
    });
    if (!request)
      throw new AppError({
        code: "FORBIDDEN",
        message: "This notification does not belong to the supplied account and profile.",
      });
  } else if (
    input.profileId &&
    !(await tx.userProfile.findFirst({
      where: { id: input.profileId, ownerUserId: input.userId, deletedAt: null },
      select: { id: true },
    }))
  )
    throw new AppError({
      code: "FORBIDDEN",
      message: "This notification profile belongs to another account.",
    });
  const preferences = notificationPreferences(user.preferences);
  const emailConsentId =
    user.emailVerified && preferences?.emailEnabled ? preferences.emailConsentId : null;
  const notification = await tx.notification.upsert({
    where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
    create: {
      ...input,
      profileId: input.profileId ?? null,
      removalRequestId: input.removalRequestId ?? null,
      actionUrl: input.actionUrl ?? null,
      channel: emailConsentId ? "EMAIL" : "IN_APP",
      emailConsentId,
      emailDispatchState: emailConsentId ? "PREPARED" : null,
    },
    update: {},
  });
  if (
    notification.emailConsentId &&
    notification.emailConsentId === emailConsentId &&
    notification.emailDispatchState === "PREPARED" &&
    !notification.readAt &&
    !notification.dismissedAt
  )
    await tx.backgroundJob.upsert({
      where: { idempotencyKey: `notify:${notification.id}` },
      create: {
        type: "DISPATCH_NOTIFICATION",
        payloadJson: parseJobPayload("DISPATCH_NOTIFICATION", {
          notificationId: notification.id,
        }),
        idempotencyKey: `notify:${notification.id}`,
        relatedUserId: input.userId,
        relatedRequestId: input.removalRequestId ?? null,
      },
      update: {},
    });
  return notification;
}

export async function createNotification(actor: ActorContext, input: NewNotification) {
  requirePermission(actor, "notification:update", { ownerUserId: input.userId });
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, input.userId);
    return createNotificationInTx(tx, input);
  });
}

export async function listOwnedNotifications(actor: ActorContext, raw: unknown = {}) {
  requirePermission(actor, "notification:read", { ownerUserId: actor.userId });
  const input = parseWithSchema(
    pageInputSchema.extend({
      filter: z.enum(["all", "unread", "dismissed"]).default("unread"),
    }),
    raw
  );
  const rows = await prisma.notification.findMany({
    where: {
      userId: actor.userId,
      user: { status: "ACTIVE", deletionRequestedAt: null },
      ...(input.filter === "dismissed"
        ? { dismissedAt: { not: null } }
        : { dismissedAt: null }),
      ...(input.filter === "unread" ? { readAt: null } : {}),
      ...createdBeforeCursor(input.cursor),
    },
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      actionUrl: true,
      severity: true,
      createdAt: true,
      readAt: true,
      dismissedAt: true,
      emailDispatchState: true,
      emailProvider: true,
      emailedAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
  return cursorPage(
    rows.map((row) => ({ ...row, actionUrl: notificationHref(row.actionUrl) })),
    input.limit
  );
}

export async function getNotificationPreferences(actor: ActorContext) {
  requirePermission(actor, "notification:read", { ownerUserId: actor.userId });
  const user = await prisma.user.findFirst({
    where: { id: actor.userId, status: "ACTIVE", deletionRequestedAt: null },
    select: { preferences: true },
  });
  if (!user) throw new NotFoundError("This account is not available.");
  return {
    emailEnabled: notificationPreferences(user.preferences)?.emailEnabled ?? false,
  };
}

export async function updateNotificationPreferences(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "notification:preferences", { ownerUserId: actor.userId });
  const input = parseWithSchema(z.object({ emailEnabled: z.boolean() }), raw);
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, actor.userId);
    const user = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { preferences: true, emailVerified: true },
    });
    if (input.emailEnabled && !user.emailVerified)
      throw new AppError({
        code: "CONFLICT",
        message: "Verify your sign-in email before opting in to notification emails.",
      });
    const previous = notificationPreferences(user.preferences);
    if (previous?.emailEnabled === input.emailEnabled) return input;
    const existing =
      user.preferences &&
      typeof user.preferences === "object" &&
      !Array.isArray(user.preferences)
        ? user.preferences
        : {};
    await tx.user.update({
      where: { id: actor.userId },
      data: {
        preferences: {
          ...existing,
          notifications: {
            version: 1,
            emailEnabled: input.emailEnabled,
            emailConsentId: input.emailEnabled ? randomUUID() : null,
            updatedAt: new Date().toISOString(),
            noticeHash: sha256Hex(NOTIFICATION_EMAIL_NOTICE),
          },
        } as Prisma.InputJsonObject,
      },
    });
    if (!input.emailEnabled) await cancelNotificationEmailsInTx(tx, actor.userId);
    return input;
  });
}

async function cancelNotificationEmailsInTx(
  tx: PrismaTransaction,
  userId: string,
  ids?: string[]
) {
  const where = { userId, ...(ids ? { id: { in: ids } } : {}), emailedAt: null };
  await tx.notification.updateMany({
    where: { ...where, emailDispatchState: "PREPARED" },
    data: { emailDispatchState: "CANCELLED", emailLeaseToken: null },
  });
  await tx.notification.updateMany({
    where: { ...where, emailDispatchState: "DISPATCHING" },
    data: { emailDispatchState: "AMBIGUOUS", emailLeaseToken: null },
  });
  await tx.backgroundJob.updateMany({
    where: {
      relatedUserId: userId,
      type: "DISPATCH_NOTIFICATION",
      status: { in: ["PENDING", "RETRYABLE", "RUNNING"] },
      ...(ids
        ? {
            OR: ids.map((notificationId) => ({
              payloadJson: { path: ["notificationId"], equals: notificationId },
            })),
          }
        : {}),
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lockExpiresAt: null,
      leaseToken: null,
    },
  });
}

export async function updateOwnedNotification(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(
    z.object({
      id: entityIdSchema,
      operation: z.enum(["read", "unread", "dismiss", "restore"]),
    }),
    raw
  );
  return prisma.$transaction(async (tx) => {
    const ref = await tx.notification.findUnique({
      where: { id: input.id },
      select: { userId: true },
    });
    if (!ref) throw new NotFoundError("This notification is no longer available.");
    requirePermission(actor, "notification:update", { ownerUserId: ref.userId });
    await lockActiveAccount(tx, ref.userId);
    await tx.notification.update({
      where: { id: input.id },
      data:
        input.operation === "dismiss"
          ? { dismissedAt: new Date(), readAt: new Date() }
          : input.operation === "restore"
            ? { dismissedAt: null }
            : { readAt: input.operation === "read" ? new Date() : null },
    });
    if (input.operation === "read" || input.operation === "dismiss")
      await cancelNotificationEmailsInTx(tx, ref.userId, [input.id]);
  });
}
