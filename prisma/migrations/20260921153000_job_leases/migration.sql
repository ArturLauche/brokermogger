ALTER TABLE "BackgroundJob" ADD COLUMN "leaseToken" TEXT;
-- Stop workers before migration. Old RUNNING rows are reclaimed with a new token.
UPDATE "BackgroundJob" SET "lockExpiresAt" = NOW() WHERE "status" = 'RUNNING';
