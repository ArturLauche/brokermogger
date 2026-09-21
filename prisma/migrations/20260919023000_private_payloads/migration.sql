-- CreateEnum
CREATE TYPE "StorageObjectState" AS ENUM ('UPLOADING', 'READY', 'PURGE_PENDING', 'PURGED');

-- AlterEnum
ALTER TYPE "EvidenceEncryption" ADD VALUE 'APPLICATION_AES_GCM';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailBi" TEXT,
ADD COLUMN     "emailEnc" TEXT;

-- AlterTable
ALTER TABLE "RequestSnapshot" ADD COLUMN     "erasedAt" TIMESTAMP(3),
ADD COLUMN     "payloadEnc" TEXT,
ALTER COLUMN "subject" SET DEFAULT '',
ALTER COLUMN "body" SET DEFAULT '';

-- AlterTable
ALTER TABLE "BrokerResponse" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "fromAddressEnc" TEXT,
ADD COLUMN     "providerEventId" TEXT;

-- AlterTable
ALTER TABLE "EvidenceFile" ADD COLUMN     "identityConsentRecordId" TEXT,
ADD COLUMN     "purgeRequestedAt" TIMESTAMP(3),
ADD COLUMN     "purgedAt" TIMESTAMP(3),
ADD COLUMN     "storageState" "StorageObjectState" NOT NULL DEFAULT 'READY';

-- AlterTable
ALTER TABLE "EmailWebhookEvent" ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "payloadEnc" TEXT,
ALTER COLUMN "payloadJson" SET DEFAULT '{}';

-- CreateIndex
CREATE UNIQUE INDEX "User_emailBi_key" ON "User"("emailBi");

-- CreateIndex
CREATE UNIQUE INDEX "BrokerResponse_providerEventId_key" ON "BrokerResponse"("providerEventId");

-- CreateIndex
CREATE INDEX "EvidenceFile_storageState_updatedAt_idx" ON "EvidenceFile"("storageState", "updatedAt");

-- CreateIndex
CREATE INDEX "EmailWebhookEvent_ownerUserId_idx" ON "EmailWebhookEvent"("ownerUserId");

