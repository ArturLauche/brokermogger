ALTER TYPE "JobType" ADD VALUE 'VERIFY_AUDIT_CHAIN';

CREATE TABLE "WorkerHeartbeat" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stoppedAt" TIMESTAMP(3)
);
CREATE INDEX "WorkerHeartbeat_lastSeenAt_idx" ON "WorkerHeartbeat"("lastSeenAt");

CREATE TABLE "AuditChainVerification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstSequence" BIGINT,
  "lastSequence" BIGINT,
  "lastHash" TEXT,
  "anchorHash" TEXT,
  "checkedCount" INTEGER NOT NULL,
  "isValid" BOOLEAN NOT NULL,
  "problemSequence" BIGINT,
  "problemKind" TEXT,
  CONSTRAINT "AuditChainVerification_jobId_fkey" FOREIGN KEY ("jobId")
    REFERENCES "BackgroundJob"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AuditChainVerification_result_check" CHECK (
    "checkedCount" >= 0 AND
    (("isValid" AND "problemSequence" IS NULL AND "problemKind" IS NULL) OR
     (NOT "isValid" AND "problemSequence" IS NOT NULL AND "problemKind" IN ('hash_mismatch', 'broken_link')))
  )
);
CREATE INDEX "AuditChainVerification_completedAt_id_idx" ON "AuditChainVerification"("completedAt", "id");
CREATE INDEX "AuditChainVerification_jobId_idx" ON "AuditChainVerification"("jobId");
