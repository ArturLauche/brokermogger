#!/usr/bin/env tsx
import "dotenv/config";
import { env } from "../lib/config/env";
import { deploymentPreflight } from "../lib/config/deploymentPreflight";
import { createLogger } from "../lib/observability/logger";

const log = createLogger("deployment-preflight", {}, { diagnostic: true });
// A deliberately requested diagnostic must remain visible even when runtime
// application logging is silent or restricted to errors.
log.level = "info";
const flags = process.argv.slice(2);
if (
  flags.some((flag) => flag !== "--public" && flag !== "--single-user") ||
  (flags.includes("--public") && flags.includes("--single-user"))
) {
  log.error("Usage: npm run check:deployment -- [--public | --single-user]");
  process.exitCode = 1;
} else {
  const singleUser = flags.includes("--single-user");
  if (singleUser)
    log.warn(
      "NOT VERIFIED FOR PUBLIC USE: explicitly checking a private single-user instance."
    );
  try {
    const result = deploymentPreflight(env, !singleUser);
    for (const warning of result.warnings) log.warn(warning);
    if (!result.ready) process.exitCode = 1;
    else
      log.info(
        "Configuration checked. NETWORK TRUST NOT VERIFIED: confirm ingress overwrites the selected header and direct application access is blocked; this preflight cannot attest to network topology."
      );
  } catch (error) {
    // Validation messages can embed configured values. The logger keeps only
    // safe error type/code, never the exception message, stack or input values.
    log.error(
      { err: error },
      "Deployment configuration could not be validated. Check required fields in .env.example and docs/production-deployment.md. Production requires active rate limiting and trusted attribution or explicit private shared-bucket acknowledgement."
    );
    process.exitCode = 1;
  }
}
