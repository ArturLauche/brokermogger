CREATE TYPE "DeadlineBasis" AS ENUM ('RECORDED_RECEIPT', 'DISPATCH_ESTIMATE', 'PROVIDER_DELIVERY_ESTIMATE', 'SIMULATED_DISPATCH', 'LEGACY_ESTIMATE');

ALTER TABLE "RemovalRequest"
  ADD COLUMN "deadlineOn" DATE,
  ADD COLUMN "deadlineAnchorOn" DATE,
  ADD COLUMN "deadlineBasis" "DeadlineBasis",
  ADD COLUMN "deadlineIsEstimate" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "deadlineTimezone" TEXT,
  ADD COLUMN "deadlineNote" TEXT,
  ADD COLUMN "deadlinePolicyVersion" INTEGER,
  ADD COLUMN "deadlineSnapshotId" TEXT,
  ADD COLUMN "deadlineWarningForAt" TIMESTAMP(3);

-- Keep already-submitted history, but do not reinterpret an unproven legacy clock.
UPDATE "RemovalRequest" r SET
  "deadlineOn" = (r."deadlineAt" AT TIME ZONE 'UTC')::date,
  "deadlineBasis" = 'LEGACY_ESTIMATE',
  "deadlineTimezone" = 'UTC',
  "deadlineNote" = 'Legacy day-count estimate. Record the original receipt date after reviewing the historical timing policy.'
WHERE r."deadlineAt" IS NOT NULL AND r."sentAt" IS NOT NULL;

-- An unsent draft never starts a broker response period.
UPDATE "RemovalRequest" SET "deadlineAt" = NULL
WHERE "sentAt" IS NULL AND "deadlineAt" IS NOT NULL;

UPDATE "RemovalRequest" r SET "deadlineWarningForAt" = r."deadlineAt"
WHERE r."deadlineAt" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "Notification" n WHERE n."removalRequestId" = r.id AND n.type = 'DEADLINE_APPROACHING'
);

ALTER TABLE "RemovalRequest" ADD CONSTRAINT "response_target_policy_version"
  CHECK ("deadlinePolicyVersion" IS NULL OR "deadlinePolicyVersion" = 1);
