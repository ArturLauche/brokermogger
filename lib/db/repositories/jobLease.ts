import type { JobType } from "@prisma/client";
import type { PrismaTransaction } from "@/lib/db/client";
import type { JobLease } from "@/lib/jobs/types";

/** Serialize a domain commit with cancellation and verify its current lease and payload. */
export async function lockJobLeaseInTx(
  tx: PrismaTransaction,
  job: JobLease,
  type: JobType,
  payload: Record<string, string | number | boolean>
) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "BackgroundJob" WHERE id = ${job.id} AND "leaseToken" = ${job.leaseToken}
      AND type::text = ${type} AND "payloadJson" @> ${JSON.stringify(payload)}::jsonb
      AND status = 'RUNNING' AND "lockExpiresAt" > NOW() FOR UPDATE
  `;
  return rows.length === 1;
}
