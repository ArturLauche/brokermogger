ALTER TYPE "NotificationType" ADD VALUE 'REPORT_READY';

ALTER TABLE "Report"
  ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "rangeStartAt" TIMESTAMP(3),
  ADD COLUMN "rangeEndAt" TIMESTAMP(3),
  ADD COLUMN "submissionKey" TEXT,
  ADD COLUMN "jobId" TEXT,
  ADD COLUMN "generationLeaseToken" TEXT,
  ADD COLUMN "sourceCutoffAt" TIMESTAMP(3),
  ADD COLUMN "processedRequests" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalRequests" INTEGER NOT NULL DEFAULT 0;

-- Legacy forms interpreted calendar dates in UTC. Keep that interpretation;
-- ready historical artifacts remain unchanged. Regeneration includes the end day.
UPDATE "Report" SET "rangeStartAt" = "dateFrom", "rangeEndAt" = "dateTo" + INTERVAL '1 day';
UPDATE "Report" r SET "jobId" = j.id FROM "BackgroundJob" j
  WHERE j."idempotencyKey" = 'report:' || r.id AND j.type = 'GENERATE_REPORT';
ALTER TABLE "Report" ALTER COLUMN "rangeStartAt" SET NOT NULL,
  ALTER COLUMN "rangeEndAt" SET NOT NULL;
CREATE UNIQUE INDEX "Report_submissionKey_key" ON "Report"("submissionKey");
CREATE UNIQUE INDEX "Report_jobId_key" ON "Report"("jobId");
CREATE INDEX "Report_userId_createdAt_id_idx" ON "Report"("userId", "createdAt", id);
ALTER TABLE "Report" ADD CONSTRAINT "Report_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"(id) ON DELETE SET NULL ON UPDATE CASCADE;
