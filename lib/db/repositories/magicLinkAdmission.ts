/** Anonymous authentication admission: quota and mandatory proof share one commit. */
import { prisma } from "@/lib/db/client";
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
  return prisma.$transaction(
    async (tx) => {
      // A Prisma deadline alone does not interrupt PostgreSQL lock waits. Keep
      // both bucket and chain contention bounded inside this transaction only.
      await tx.$executeRaw`
        SELECT set_config('lock_timeout', '1s', true),
               set_config('statement_timeout', '2s', true)
      `;
      return admit({
        incrementBuckets: (identities) => incrementBuckets(identities, tx),
        appendAuditLog: (input, hash) => appendAuditLogInTransaction(tx, input, hash),
      });
    },
    { maxWait: 2_000, timeout: 3_000 }
  );
}
