import { prisma } from "@/lib/db/client";
import { parseJobPayload } from "@/lib/jobs/payloads";
import type { DeadlineWatchProgress, JobLease } from "@/lib/jobs/types";
import { lockJobLeaseInTx } from "./jobLease";

/** Each completed batch advances under the same cancellation fence as its effects. */
export async function checkpointDeadlineWatchProgress(
  job: JobLease,
  progress?: DeadlineWatchProgress
) {
  return prisma.$transaction(async (tx) => {
    if (!(await lockJobLeaseInTx(tx, job, "DEADLINE_WATCH", {}))) return false;
    const current = await tx.backgroundJob.findUniqueOrThrow({
      where: { id: job.id },
      select: { payloadJson: true },
    });
    const payload = parseJobPayload("DEADLINE_WATCH", current.payloadJson);
    const next = parseJobPayload("DEADLINE_WATCH", {
      windowDays: payload.windowDays,
      ...(progress ? { progress } : {}),
    });
    await tx.backgroundJob.update({ where: { id: job.id }, data: { payloadJson: next } });
    return true;
  });
}
