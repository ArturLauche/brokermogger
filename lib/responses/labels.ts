import type { BrokerResponseClassification, RequestStatus } from "@prisma/client";

export const RESPONSE_LABELS: Record<BrokerResponseClassification, string> = {
  CONFIRMED_COMPLETED: "Broker reports completion",
  PARTIALLY_COMPLETED: "Part of the request completed",
  REJECTED: "Request rejected",
  VERIFICATION_REQUESTED: "Verification requested",
  AUTO_ACKNOWLEDGEMENT: "Receipt acknowledged",
  UNCLEAR: "Unclear — needs review",
  OUT_OF_SCOPE: "Unrelated to this request",
};

export const RESPONSE_STATUS: Partial<
  Record<BrokerResponseClassification, RequestStatus>
> = {
  CONFIRMED_COMPLETED: "COMPLETED",
  PARTIALLY_COMPLETED: "PARTIALLY_COMPLETED",
  REJECTED: "REJECTED",
  VERIFICATION_REQUESTED: "BROKER_REQUESTED_VERIFICATION",
};
