CREATE TYPE "DispatchState" AS ENUM ('PREPARED', 'DISPATCHING', 'ACCEPTED', 'AMBIGUOUS', 'RECONCILIATION_REQUIRED', 'CANCELLED');
ALTER TABLE "RemovalRequest" ADD COLUMN "approvedSnapshotId" TEXT, ADD COLUMN "approvedEnvelopeHash" TEXT;
ALTER TABLE "RequestSnapshot" ADD COLUMN "envelopeVersion" INTEGER, ADD COLUMN "envelopeEnc" TEXT, ADD COLUMN "envelopeHash" TEXT;
ALTER TABLE "OutboundEmail" ADD COLUMN "replyToEnc" TEXT,
  ADD COLUMN "snapshotId" TEXT, ADD COLUMN "approvalEnvelopeHash" TEXT, ADD COLUMN "approvalConsentRecordId" TEXT,
  ADD COLUMN "dispatchState" "DispatchState" NOT NULL DEFAULT 'PREPARED', ADD COLUMN "dispatchToken" TEXT,
  ADD COLUMN "dispatchStartedAt" TIMESTAMP(3), ADD COLUMN "lastDispatchAt" TIMESTAMP(3), ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "OutboundEmail_idempotencyKey_key" ON "OutboundEmail"("idempotencyKey");
UPDATE "OutboundEmail" SET "dispatchState" = CASE
  WHEN "status" IN ('SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'SUPPRESSED') THEN 'ACCEPTED'::"DispatchState"
  ELSE 'RECONCILIATION_REQUIRED'::"DispatchState" END;
-- No legacy queued job may send content whose complete approval cannot be proven.
UPDATE "BackgroundJob" SET "status" = 'CANCELLED', "cancelledAt" = NOW(),
  "lockedAt" = NULL, "lockedBy" = NULL, "lockExpiresAt" = NULL, "leaseToken" = NULL,
  "lastError" = 'Upgrade requires a fresh review of the full message envelope.'
WHERE "type" = 'SEND_REQUEST' AND "status" IN ('PENDING', 'RETRYABLE', 'RUNNING');
