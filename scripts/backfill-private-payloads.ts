import "dotenv/config";
import {
  backfillPrivatePayloads,
  disconnectMaintenanceClient,
} from "@/lib/db/repositories/privacyMigration";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("maintenance.private-payloads");
async function main() {
  let remaining = true;
  while (remaining) {
    const counts = await backfillPrivatePayloads();
    log.info(counts, "Private payload migration batch verified");
    remaining = Object.values(counts).some((count) => count > 0);
  }
}
main()
  .catch((error: unknown) => {
    log.error(
      { err: error },
      "Private payload migration stopped. Restore access to the configured keys/storage and rerun; completed batches are safe to repeat."
    );
    process.exitCode = 1;
  })
  .finally(disconnectMaintenanceClient);
