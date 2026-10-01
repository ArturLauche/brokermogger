import { isAppError } from "@/lib/core/errors";
import { parseJobPayload } from "@/lib/jobs/payloads";

/** A damaged or misbound legacy job is never used to infer the owner's next message. */
export function readFollowUpWork(
  raw: unknown,
  requestId: string,
  followUpNumber: number
) {
  try {
    const payload = parseJobPayload("PREPARE_FOLLOW_UP", raw);
    return payload.removalRequestId === requestId &&
      payload.followUpNumber === followUpNumber
      ? payload
      : null;
  } catch (error) {
    if (isAppError(error) && error.code === "VALIDATION_FAILED") return null;
    throw error;
  }
}
