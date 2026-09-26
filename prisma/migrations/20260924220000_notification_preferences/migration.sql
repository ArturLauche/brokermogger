ALTER TABLE "Notification"
  ADD COLUMN "emailConsentId" TEXT,
  ADD COLUMN "emailDispatchState" "DispatchState",
  ADD COLUMN "emailDispatchStartedAt" TIMESTAMP(3),
  ADD COLUMN "emailLeaseToken" TEXT,
  ADD COLUMN "emailProvider" "EmailProviderKind";

-- Legacy jobs do not prove notification-email opt-in. Keep their in-app messages.
UPDATE "Notification" SET channel = 'IN_APP' WHERE "emailedAt" IS NULL;
UPDATE "BackgroundJob"
SET status = 'CANCELLED', "cancelledAt" = NOW(), "lockedAt" = NULL,
    "lockedBy" = NULL, "leaseToken" = NULL, "lockExpiresAt" = NULL,
    "lastError" = 'Notification email requires explicit account-holder opt-in.'
WHERE type = 'DISPATCH_NOTIFICATION' AND status IN ('PENDING', 'RETRYABLE', 'RUNNING');

CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification"("userId", "createdAt", id);
