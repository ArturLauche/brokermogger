/**
 * Persistence for instance settings and per-account fair-use quota rows.
 */
import { prisma } from "@/lib/db/client";

export async function listSystemSettingRows() {
  return prisma.systemSetting.findMany({
    select: { key: true, valueJson: true },
  });
}

export async function getUserQuotaRow(userId: string) {
  return prisma.userQuota.findUnique({
    where: { userId },
    select: {
      requestsPerDay: true,
      requestsPerMonth: true,
      requestsPerBrokerPer30Days: true,
    },
  });
}
