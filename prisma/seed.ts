/**
 * Seed entry point.
 *
 * Runs every writer in dependency order, prints one summary table and exits
 * with a non-zero status when a step fails. The whole run is idempotent: it can
 * be executed as often as needed and converges on the shipped demo data set.
 *
 *   npm run db:seed
 *   SEED_DEMO_USERS=true npm run db:seed   # additionally creates demo accounts
 */
import { PrismaClient } from "@prisma/client";

import { seedBrokers } from "./seeds/brokers";
import { seedDemoUsers } from "./seeds/demoUsers";
import { seedJurisdictions } from "./seeds/jurisdictions";
import { seedLegalRules } from "./seeds/legalRules";
import { seedSystemSettings } from "./seeds/settings";
import { seedRequestTemplates } from "./seeds/templates";
import { type SeedStepResult } from "./seeds/types";

const prisma = new PrismaClient({ log: ["error"] });

const STEPS: { run: (client: PrismaClient) => Promise<SeedStepResult> }[] = [
  { run: seedJurisdictions },
  { run: seedLegalRules },
  { run: seedRequestTemplates },
  { run: seedBrokers },
  { run: seedSystemSettings },
  { run: seedDemoUsers },
];

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function padLeft(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value;
}

function printSummary(results: SeedStepResult[], durationMs: number): void {
  const columns = [
    { header: "Step", width: 20 },
    { header: "created", width: 8 },
    { header: "updated", width: 8 },
    { header: "skipped", width: 8 },
    { header: "removed", width: 8 },
  ];

  const header =
    pad(columns[0]?.header ?? "", 20) +
    columns
      .slice(1)
      .map((column) => "  " + padLeft(column.header, column.width))
      .join("");
  const divider = "-".repeat(header.length);

  console.log("");
  console.log("Seed summary");
  console.log(divider);
  console.log(header);
  console.log(divider);

  for (const result of results) {
    console.log(
      pad(result.step, 20) +
        "  " +
        padLeft(String(result.created), 8) +
        "  " +
        padLeft(String(result.updated), 8) +
        "  " +
        padLeft(String(result.skipped), 8) +
        "  " +
        padLeft(String(result.removed), 8)
    );
  }

  console.log(divider);

  for (const result of results) {
    for (const note of result.notes) {
      console.log(`${result.step}: ${note}`);
    }
  }

  console.log(divider);
  console.log(`Completed in ${(durationMs / 1000).toFixed(1)}s.`);
  console.log(
    "All broker records are fictional demo data with production sending disabled. See docs/broker-seed-data.md."
  );
  console.log(
    "All legal rules are flagged for legal review and are not legal advice. See docs/legal-sources.md."
  );
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const results: SeedStepResult[] = [];

  for (const step of STEPS) {
    results.push(await step.run(prisma));
  }

  printSummary(results, Date.now() - startedAt);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
