/** Shared narrow public-configuration projection. Evidence notes stay on the server. */
import type { Prisma } from "@prisma/client";
import { brokerReadiness } from "@/lib/brokers/readiness";

export const BROKER_READINESS_SELECT = {
  id: true,
  slug: true,
  isActive: true,
  isDemoData: true,
  deletedAt: true,
  productionSendingEnabled: true,
  productionUnsafeFlag: true,
  verificationStatus: true,
  lastVerifiedAt: true,
  sourceUrl: true,
  contactMethods: {
    where: { deletedAt: null },
    select: {
      id: true,
      type: true,
      value: true,
      isActive: true,
      isVerified: true,
      verifiedAt: true,
      sourceUrl: true,
      verificationNote: true,
    },
  },
  jurisdictionCoverage: {
    where: { isActive: true },
    select: {
      jurisdictionId: true,
      isActive: true,
      coverageType: true,
      supportedRequestTypes: true,
      jurisdiction: { select: { isActive: true } },
    },
  },
} satisfies Prisma.BrokerSelect;

type ReadinessRow = Prisma.BrokerGetPayload<{ select: typeof BROKER_READINESS_SELECT }>;
export function withBrokerReadiness<T extends ReadinessRow>(row: T, now = new Date()) {
  const { contactMethods: _evidence, ...publicRow } = row;
  return { ...publicRow, readiness: brokerReadiness(row, now) };
}
