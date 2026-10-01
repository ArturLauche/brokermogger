ALTER TABLE "BrokerResponse"
  ADD COLUMN "userId" TEXT,
  ADD COLUMN "receivedOn" DATE,
  ADD COLUMN "confirmedById" TEXT,
  ADD COLUMN "classificationRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "appliedStatus" "RequestStatus",
  ADD COLUMN "suggestedClassification" "BrokerResponseClassification" NOT NULL DEFAULT 'UNCLEAR',
  ADD COLUMN "submissionKey" TEXT,
  ADD COLUMN "metadataEnc" TEXT;
UPDATE "BrokerResponse" AS response SET "userId" = request."userId", "suggestedClassification" = response.classification
FROM "RemovalRequest" AS request WHERE request.id = response."removalRequestId";
ALTER TABLE "BrokerResponse" ALTER COLUMN "userId" SET NOT NULL,
  ALTER COLUMN "removalRequestId" DROP NOT NULL, ALTER COLUMN "brokerId" DROP NOT NULL;
ALTER TABLE "BrokerResponse" ADD CONSTRAINT "BrokerResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "BrokerResponse_submissionKey_key" ON "BrokerResponse"("submissionKey");
CREATE INDEX "BrokerResponse_userId_createdAt_id_idx" ON "BrokerResponse"("userId", "createdAt", id);
CREATE TABLE "InboundMailbox" (
  id TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  domain TEXT NOT NULL,
  "addressEnc" TEXT NOT NULL,
  "addressBi" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboundMailbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InboundMailbox_addressBi_key" ON "InboundMailbox"("addressBi");
CREATE UNIQUE INDEX "InboundMailbox_userId_domain_key" ON "InboundMailbox"("userId", domain);
ALTER TABLE "EmailWebhookEvent" ADD COLUMN "brokerResponseId" TEXT;
ALTER TABLE "EmailWebhookEvent" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "EmailWebhookEvent" ADD CONSTRAINT "EmailWebhookEvent_brokerResponseId_fkey" FOREIGN KEY ("brokerResponseId") REFERENCES "BrokerResponse"(id) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "EmailWebhookEvent_brokerResponseId_idx" ON "EmailWebhookEvent"("brokerResponseId");
CREATE INDEX "EmailWebhookEvent_providerMessageId_processedAt_idx" ON "EmailWebhookEvent"("providerMessageId", "processedAt");
