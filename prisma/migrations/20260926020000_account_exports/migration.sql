ALTER TYPE "EvidenceKind" ADD VALUE 'ACCOUNT_EXPORT';
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_EXPORT_READY';
ALTER TYPE "JobType" ADD VALUE 'GENERATE_ACCOUNT_EXPORT';
CREATE TYPE "AccountExportMode" AS ENUM ('MASKED', 'SENSITIVE');
CREATE TYPE "AccountExportStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');
CREATE TABLE "AccountExport" (
  id TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  mode "AccountExportMode" NOT NULL,
  status "AccountExportStatus" NOT NULL DEFAULT 'PENDING',
  "submissionKey" TEXT NOT NULL,
  "jobId" TEXT,
  "generationLeaseToken" TEXT,
  "sourceCutoffAt" TIMESTAMP(3),
  "processedRecords" INTEGER NOT NULL DEFAULT 0,
  "consentedAt" TIMESTAMP(3),
  "consentVersion" INTEGER,
  "consentStatementHash" TEXT,
  "evidenceFileId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "generatedAt" TIMESTAMP(3),
  error TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "AccountExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AccountExport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AccountExport_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "EvidenceFile"(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccountExport_submissionKey_key" ON "AccountExport"("submissionKey");
CREATE UNIQUE INDEX "AccountExport_jobId_key" ON "AccountExport"("jobId");
CREATE INDEX "AccountExport_userId_createdAt_id_idx" ON "AccountExport"("userId", "createdAt", id);
