#!/usr/bin/env tsx
import "dotenv/config";
import { env } from "../lib/config/env";
import { deploymentPreflight } from "../lib/config/deploymentPreflight";
import { createLogger } from "../lib/observability/logger";

const log = createLogger("deployment-preflight");
// A deliberately requested diagnostic must remain visible even when runtime
// application logging is silent or restricted to errors.
log.level = "info";
const flags = process.argv.slice(2);
if (flags.some((flag) => flag !== "--public")) {
  log.error("Usage: npm run check:deployment -- [--public]");
  process.exitCode = 1;
} else {
  const result = deploymentPreflight(env, flags.includes("--public"));
  for (const warning of result.warnings) log.warn(warning);
  if (!result.ready) process.exitCode = 1;
  else
    log.info(
      "Configuration checked. Verify that ingress overwrites the selected header and that direct application access is blocked; this preflight cannot attest to network topology."
    );
}
