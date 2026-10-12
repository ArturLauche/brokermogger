import { prisma, type PrismaTransaction } from "@/lib/db/client";

/** Shared database budget for standalone counters and mandatory auth admission. */
export function withRateLimitTransaction<T>(
  run: (tx: PrismaTransaction) => Promise<T>
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // Client deadlines alone do not interrupt a statement queued on a row or
      // advisory lock. Local settings are discarded on commit or rollback.
      await tx.$executeRaw`
      SELECT set_config('lock_timeout', '1s', true),
             set_config('statement_timeout', '2s', true)
    `;
      return run(tx);
    },
    { maxWait: 2_000, timeout: 3_000 }
  );
}
