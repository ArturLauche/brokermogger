import type { JobType, RequestStatus } from "@prisma/client";
import type { ActorContext } from "@/lib/permissions/actor";
import { applyRequestStatus } from "@/lib/db/repositories/requests";

const JOBS_CANCELLED_ON_STATUS = new Set<RequestStatus>([
  "COMPLETED",
  "CLOSED",
  "REJECTED",
  "FAILED",
]);

const REQUEST_JOBS_TO_CANCEL: JobType[] = [
  "RECHECK_REMINDER",
  "PREPARE_FOLLOW_UP",
  "SEND_REQUEST",
];

export async function transition(
  actor: ActorContext,
  requestId: string,
  from: RequestStatus,
  to: RequestStatus,
  message: string
): Promise<void> {
  await applyRequestStatus(actor, {
    requestId,
    from,
    to,
    message,
    ...(JOBS_CANCELLED_ON_STATUS.has(to)
      ? { cancelPendingJobTypes: REQUEST_JOBS_TO_CANCEL }
      : {}),
  });
}
