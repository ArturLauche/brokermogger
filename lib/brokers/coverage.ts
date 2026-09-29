import type { CoverageType, RequestType } from "@prisma/client";
import { AppError } from "@/lib/core/errors";

export interface RequestCoverage {
  jurisdictionId: string;
  isActive: boolean;
  coverageType: CoverageType;
  supportedRequestTypes: readonly RequestType[];
}

export function confirmedRequestCoverage(
  row: RequestCoverage | undefined,
  type: RequestType
) {
  return (
    !!row && row.coverageType !== "UNKNOWN" && row.supportedRequestTypes.includes(type)
  );
}

export function requestCoverage(
  rows: readonly RequestCoverage[],
  jurisdictionId: string
) {
  return rows.find((row) => row.jurisdictionId === jurisdictionId && row.isActive);
}

/** Unspecified legacy coverage permits preparation with review, never real dispatch. */
export function assertBrokerRequestCompatible(
  broker: {
    isActive: boolean;
    deletedAt: Date | null;
    jurisdictionCoverage: readonly RequestCoverage[];
  },
  jurisdictionId: string,
  requestType: RequestType
) {
  if (!broker.isActive || broker.deletedAt)
    throw new AppError({
      code: "BROKER_NOT_SENDABLE",
      message:
        "A selected broker is inactive. Choose an active broker or ask a maintainer to review it.",
    });
  const coverage = requestCoverage(broker.jurisdictionCoverage, jurisdictionId);
  if (
    coverage?.supportedRequestTypes.length &&
    !coverage.supportedRequestTypes.includes(requestType)
  )
    throw new AppError({
      code: "BROKER_NOT_SENDABLE",
      message:
        "The broker does not list this request type for the profile’s jurisdiction. Review its supported methods and choose a compatible type.",
    });
  return coverage;
}
