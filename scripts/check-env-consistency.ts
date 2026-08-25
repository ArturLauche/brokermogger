#!/usr/bin/env tsx
/**
 * Fails when documented environment variables drift between `.env.example`,
 * `lib/config/env.ts`, docker compose, CI and the README.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { checkEnvConsistency } from "../lib/config/envConsistency";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const report = checkEnvConsistency({
  example: readFileSync(resolve(root, ".env.example"), "utf8"),
  envTs: readFileSync(resolve(root, "lib/config/env.ts"), "utf8"),
  compose: readFileSync(resolve(root, "docker-compose.yml"), "utf8"),
  ciWorkflow: readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8"),
  readme: readFileSync(resolve(root, "README.md"), "utf8"),
});

if (report.issues.length > 0) {
  console.error("Environment documentation is out of sync.");
  for (const issue of report.issues) {
    console.error(`  - ${issue}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Checked ${report.schemaKeys.length} environment variables.`);
}
