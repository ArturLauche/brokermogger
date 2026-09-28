import type { RequestStatus } from "@prisma/client";
import { canTransition, WAITING_STATUSES } from "./stateMachine";

export function canPrepareEscalation(
  request: { status: RequestStatus; sentAt: Date | null; deadlineAt: Date | null },
  now = new Date()
) {
  if (!request.sentAt) return false;
  if (request.status === "ESCALATION_RECOMMENDED") return true;
  const overdue = !!request.deadlineAt && request.deadlineAt <= now;
  if (request.status === "FOLLOW_UP_SCHEDULED") return overdue;
  if (canTransition(request.status, "ESCALATION_RECOMMENDED", "USER")) return true;
  return (
    overdue &&
    WAITING_STATUSES.includes(request.status) &&
    canTransition(request.status, "NO_RESPONSE", "SYSTEM")
  );
}
