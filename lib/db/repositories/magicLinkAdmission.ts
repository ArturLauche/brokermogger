/** Anonymous authentication admission: quota and mandatory proof share one commit. */
import { withRateLimitTransaction } from "@/lib/db/rateLimitTransaction";
import { appendAuditLogInTransaction, type AuditLogAppender } from "./audit";
import { incrementBuckets, type BucketIncrementer } from "./rateLimit";

interface MagicLinkAdmissionPorts {
  incrementBuckets: BucketIncrementer;
  appendAuditLog: AuditLogAppender;
}

/**
 * Only narrow write ports leave this repository; no domain caller receives a
 * Prisma client. Authentication buckets are instance infrastructure rather than
 * account-owned data, and keys arrive hashed by the rate-limit service.
 *
 * Admission always locks email, then network, then the audit chain. All callers
 * use that order, including rejected attempts, without a nested transaction.
 */
export async function withMagicLinkAdmission<T>(
  admit: (ports: MagicLinkAdmissionPorts) => Promise<T>
): Promise<T> {
  return withRateLimitTransaction((tx) =>
    admit({
      incrementBuckets: (identities) => incrementBuckets(identities, tx),
      appendAuditLog: (input, hash) => appendAuditLogInTransaction(tx, input, hash),
    })
  );
}
