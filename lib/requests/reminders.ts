import type { RequestStatus } from "@prisma/client";
import { WAITING_STATUSES } from "./stateMachine";
const RECHECK_REMINDER_STATUSES = new Set<RequestStatus>([
  ...WAITING_STATUSES,
  "NO_RESPONSE",
  "FOLLOW_UP_SCHEDULED",
  "ESCALATION_RECOMMENDED",
  "PARTIALLY_COMPLETED",
]);
export function isRecheckReminderApplicable(status: RequestStatus): boolean {
  return RECHECK_REMINDER_STATUSES.has(status);
}
