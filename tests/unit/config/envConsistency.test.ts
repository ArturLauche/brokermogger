import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkEnvConsistency,
  parseDotEnvKeys,
  parseZodSchemaKeys,
} from "@/lib/config/envConsistency";

const root = resolve(import.meta.dirname, "../../..");

const validInput = {
  example: [
    "APP_ENV=development",
    "DATABASE_URL=postgresql://brokermogger:brokermogger@localhost:5432/brokermogger",
    "TEST_DATABASE_URL=postgresql://brokermogger:brokermogger@localhost:5433/brokermogger_test",
  ].join("\n"),
  envTs: `
const rawSchema = z.object({
  APP_ENV: appEnvSchema.default("development"),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),
});

export type RawEnv = z.infer<typeof rawSchema>;
`,
  compose: `
services:
  postgres-test:
    ports:
      - "5433:5432"
`,
  ciWorkflow: `
    services:
      postgres-test:
        ports:
          - 5433:5432
    env:
      DATABASE_URL: postgresql://brokermogger:brokermogger@127.0.0.1:5433/brokermogger_test
      TEST_DATABASE_URL: postgresql://brokermogger:brokermogger@127.0.0.1:5433/brokermogger_test
    steps:
      - run: npm ci --include=dev
`,
  readme:
    "Integration tests need postgres-test on port 5433. No GitHub secrets are required for CI.",
};

describe("env documentation parsers", () => {
  it("reads keys from a dotenv file and ignores comments", () => {
    expect(
      parseDotEnvKeys("# comment\nAPP_ENV=development\n\nDATABASE_URL=postgres://x\n")
    ).toEqual(["APP_ENV", "DATABASE_URL"]);
  });

  it("reads keys from the Zod raw schema block", () => {
    expect(parseZodSchemaKeys(validInput.envTs).sort()).toEqual([
      "APP_ENV",
      "DATABASE_URL",
      "TEST_DATABASE_URL",
    ]);
  });
});

describe("checkEnvConsistency", () => {
  it("accepts a matching catalogue, compose file, CI workflow and README", () => {
    expect(checkEnvConsistency(validInput).issues).toEqual([]);
  });

  it("reports schema keys missing from .env.example", () => {
    const report = checkEnvConsistency({
      ...validInput,
      example: "APP_ENV=development\n",
    });
    expect(report.issues.join("\n")).toMatch(/missing from \.env\.example/i);
  });

  it("rejects CI database URLs that use localhost instead of 127.0.0.1", () => {
    const report = checkEnvConsistency({
      ...validInput,
      ciWorkflow: validInput.ciWorkflow.replaceAll("127.0.0.1", "localhost"),
    });
    expect(report.issues.join("\n")).toMatch(/127\.0\.0\.1:5433/);
  });

  it("rejects a CI workflow that lets NODE_ENV=production omit devDependencies", () => {
    const report = checkEnvConsistency({
      ...validInput,
      ciWorkflow: validInput.ciWorkflow.replace("npm ci --include=dev", "npm ci"),
    });
    expect(report.issues.join("\n")).toMatch(/include=dev/);
  });

  it("rejects a compose file that does not expose postgres-test on 5433", () => {
    const report = checkEnvConsistency({
      ...validInput,
      compose: 'services:\n  postgres:\n    ports:\n      - "5432:5432"\n',
    });
    expect(report.issues.join("\n")).toMatch(/postgres-test/);
  });
});

describe("checked-in env documentation", () => {
  it("stays in sync across .env.example, env.ts, compose, CI and the README", () => {
    const report = checkEnvConsistency({
      example: readFileSync(resolve(root, ".env.example"), "utf8"),
      envTs: readFileSync(resolve(root, "lib/config/env.ts"), "utf8"),
      compose: readFileSync(resolve(root, "docker-compose.yml"), "utf8"),
      ciWorkflow: readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8"),
      readme: readFileSync(resolve(root, "README.md"), "utf8"),
    });
    expect(report.issues).toEqual([]);
    expect(report.schemaKeys.length).toBeGreaterThan(20);
  });
});
