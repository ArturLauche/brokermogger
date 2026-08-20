/**
 * In-app notifications. Email dispatch is a separate job.
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";

export async function createNotification(data: Prisma.NotificationCreateInput) {
  try {
    return await prisma.notification.create({ data });
  } catch (error) {
    // Unique (userId, dedupeKey) - treat duplicates as success.
    const userId = data.user.connect?.id;
    const existing =
      data.dedupeKey && userId
        ? await prisma.notification.findFirst({
            where: { userId, dedupeKey: data.dedupeKey },
          })
        : null;
    if (existing) return existing;
    throw error;
  }
}

export async function listNotifications(userId: string, unreadOnly = false) {
  return prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function markNotificationRead(userId: string, id: string) {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { readAt: new Date() },
  });
}

export async function getNotification(id: string) {
  return prisma.notification.findUnique({ where: { id } });
}
