/**
 * Documentation and CI/compose checks for environment variables.
 *
 * `lib/config/env.ts` is the schema. `.env.example` is the operator-facing
 * catalogue. GitHub Actions and docker compose must keep using the test
 * Postgres port that `.env.example` documents (5433) and must not point at
 * `localhost` (IPv6 `::1` flakes on GitHub-hosted runners).
 */
const TEST_POSTGRES_PORT = "5433";

export interface EnvConsistencyInput {
  example: string;
  envTs: string;
  compose: string;
  ciWorkflow: string;
  readme: string;
}

export interface EnvConsistencyReport {
  schemaKeys: string[];
  exampleKeys: string[];
  issues: string[];
}

export function parseDotEnvKeys(source: string): string[] {
  const keys = new Set<string>();
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    keys.add(line.slice(0, line.indexOf("=")));
  }
  return [...keys];
}

export function parseZodSchemaKeys(envTsSource: string): string[] {
  const schemaBlock = envTsSource.slice(
    envTsSource.indexOf("const rawSchema"),
    envTsSource.indexOf("export type RawEnv")
  );
  const keys = new Set(
    [...schemaBlock.matchAll(/\b([A-Z][A-Z0-9_]+):/g)].map((match) => match[1] ?? "")
  );
  keys.delete("");
  return [...keys];
}

function hasTestPostgresPortMapping(source: string): boolean {
  return (
    source.includes("postgres-test") &&
    (source.includes(`- ${TEST_POSTGRES_PORT}:5432`) ||
      source.includes(`- "${TEST_POSTGRES_PORT}:5432"`))
  );
}

function databaseUrlsUseLoopbackTestPort(ciWorkflow: string): boolean {
  const databaseUrl = ciWorkflow.match(/^\s+DATABASE_URL:\s+(\S+)/m)?.[1] ?? "";
  const testDatabaseUrl = ciWorkflow.match(/^\s+TEST_DATABASE_URL:\s+(\S+)/m)?.[1] ?? "";
  const expected = `127.0.0.1:${TEST_POSTGRES_PORT}`;
  return databaseUrl.includes(expected) && testDatabaseUrl.includes(expected);
}

export function checkEnvConsistency(input: EnvConsistencyInput): EnvConsistencyReport {
  const schemaKeys = parseZodSchemaKeys(input.envTs);
  const exampleKeys = parseDotEnvKeys(input.example);
  const issues: string[] = [];

  const missingFromExample = schemaKeys.filter((key) => !exampleKeys.includes(key));
  const extraInExample = exampleKeys.filter((key) => !schemaKeys.includes(key));

  if (missingFromExample.length > 0) {
    issues.push(
      `In env.ts but missing from .env.example: ${missingFromExample.join(", ")}`
    );
  }
  if (extraInExample.length > 0) {
    issues.push(`In .env.example but not in env.ts: ${extraInExample.join(", ")}`);
  }

  if (!input.example.includes(`:${TEST_POSTGRES_PORT}/`)) {
    issues.push(
      `.env.example must document TEST_DATABASE_URL on port ${TEST_POSTGRES_PORT}.`
    );
  }

  if (!hasTestPostgresPortMapping(input.compose)) {
    issues.push(
      `docker-compose.yml must expose postgres-test on host port ${TEST_POSTGRES_PORT}.`
    );
  }

  if (!hasTestPostgresPortMapping(input.ciWorkflow)) {
    issues.push(
      `CI must map the postgres-test service to host port ${TEST_POSTGRES_PORT}.`
    );
  }

  if (!databaseUrlsUseLoopbackTestPort(input.ciWorkflow)) {
    issues.push(
      `CI DATABASE_URL and TEST_DATABASE_URL must use 127.0.0.1:${TEST_POSTGRES_PORT} (not localhost) so Node does not try IPv6 ::1.`
    );
  }

  if (!input.ciWorkflow.includes("npm ci --include=dev")) {
    issues.push(
      "CI must run `npm ci --include=dev` so NODE_ENV=production on the runner cannot omit devDependencies."
    );
  }

  const readme = input.readme.toLowerCase();
  if (!readme.includes(TEST_POSTGRES_PORT)) {
    issues.push(`README must mention the test Postgres port ${TEST_POSTGRES_PORT}.`);
  }
  if (!readme.includes("no github secrets")) {
    issues.push("README must state that CI needs no GitHub secrets.");
  }

  return { schemaKeys, exampleKeys, issues };
}
