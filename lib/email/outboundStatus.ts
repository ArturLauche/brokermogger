/**
 * Terminal vs resumable outbound ledger statuses. Kept free of persistence so
 * send retry logic can be unit tested without the database.
 */
import type { EmailStatus } from "@prisma/client";

const TERMINAL_OUTBOUND_SUCCESS: ReadonlySet<EmailStatus> = new Set([
  "SENT",
  "DELIVERED",
  "BOUNCED",
  "COMPLAINED",
  "SUPPRESSED",
]);

/**
 * True when this attempt must not be handed to a provider again. `QUEUED` is
 * in-flight or a crash mid-send and may be resumed on the same ledger row.
 * `FAILED` may be retried on the same row.
 */
export function isOutboundAttemptComplete(status: EmailStatus): boolean {
  return TERMINAL_OUTBOUND_SUCCESS.has(status);
}

export function outboundAttemptLeftTheInstance(status: EmailStatus): boolean {
  return (
    status === "SENT" ||
    status === "DELIVERED" ||
    status === "BOUNCED" ||
    status === "COMPLAINED"
  );
}
