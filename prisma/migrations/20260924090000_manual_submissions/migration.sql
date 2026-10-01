CREATE TABLE "ManualSubmission" (
  "id" TEXT NOT NULL,
  "removalRequestId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "submittedOn" DATE NOT NULL,
  "receivedOn" DATE,
  "evidenceFileId" TEXT,
  "recordedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ManualSubmission_removalRequestId_fkey" FOREIGN KEY ("removalRequestId") REFERENCES "RemovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManualSubmission_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RequestSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManualSubmission_evidenceFileId_fkey" FOREIGN KEY ("evidenceFileId") REFERENCES "EvidenceFile"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "manual_receipt_after_submission" CHECK ("receivedOn" IS NULL OR "receivedOn" >= "submittedOn")
);
CREATE UNIQUE INDEX "ManualSubmission_snapshotId_key" ON "ManualSubmission"("snapshotId");
CREATE INDEX "ManualSubmission_removalRequestId_createdAt_idx" ON "ManualSubmission"("removalRequestId", "createdAt");
ALTER TABLE "OutboundEmail" ADD COLUMN "reconciledAt" TIMESTAMP(3), ADD COLUMN "reconciledById" TEXT;
