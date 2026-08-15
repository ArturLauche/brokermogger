-- DropForeignKey
ALTER TABLE "ConsentRecord" DROP CONSTRAINT "ConsentRecord_householdConsentId_fkey";

-- DropForeignKey
ALTER TABLE "ConsentRecord" DROP CONSTRAINT "ConsentRecord_removalRequestId_fkey";

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_householdConsentId_fkey" FOREIGN KEY ("householdConsentId") REFERENCES "HouseholdConsent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_removalRequestId_fkey" FOREIGN KEY ("removalRequestId") REFERENCES "RemovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
