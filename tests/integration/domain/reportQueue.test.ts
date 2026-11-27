import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

import { claimDueJobs } from "@/lib/db/repositories/jobs";
import { renderReportForJob, requestReport } from "@/lib/reports/service";
import type { ClaimedJob } from "@/lib/jobs/types";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

/**
 * The coverage journeys freeze the application clock to rehearse future legal
 * effective dates. This companion test runs on the real clock so a production
 * report request is proven to become due on the database clock without a test
 * helper forcing it.
 */
it("creates, claims and renders a report on the real clock", async () => {
  const f = await workflowFixture();
  const today = new Date().toISOString().slice(0, 10);
  const report = await requestReport(f.actor, {
    profileId: f.profile.id,
    dateFrom: today,
    dateTo: today,
    format: "JSON",
    submissionKey: randomUUID(),
  });

  const job = await testPrisma.backgroundJob.findUniqueOrThrow({
    where: { idempotencyKey: `report:${report.id}` },
  });
  expect(job.status).toBe("PENDING");

  const [clock] = await testPrisma.$queryRaw<{ skewSeconds: number }[]>`
    SELECT abs(extract(epoch FROM ("runAt" - now())))::float8 AS "skewSeconds"
    FROM "BackgroundJob" WHERE id = ${job.id}
  `;
  expect(clock).toBeDefined();
  expect(clock!.skewSeconds).toBeLessThan(5);

  // Isolate the queue assertion from fixtures that may leave other jobs due.
  await testPrisma.backgroundJob.updateMany({
    where: { id: { not: job.id } },
    data: { runAt: new Date(Date.now() + 60 * 60 * 1_000) },
  });

  const [claimed] = await claimDueJobs("report-real-clock", 1);
  expect(claimed?.id).toBe(job.id);
  expect(claimed?.type).toBe("GENERATE_REPORT");

  await renderReportForJob(claimed as ClaimedJob<"GENERATE_REPORT">);
  expect(
    await testPrisma.report.findUniqueOrThrow({
      where: { id: report.id },
      select: { status: true },
    })
  ).toEqual({ status: "READY" });
});
