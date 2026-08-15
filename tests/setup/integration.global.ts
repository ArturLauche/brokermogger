import { execSync } from "node:child_process";

import "./test-env";

/**
 * Runs once before the integration project. Applies all migrations to the
 * dedicated test database. The database itself comes from
 * `docker compose up -d postgres-test` or from the CI service container.
 */
export default function setup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start the test database with `docker compose up -d postgres-test`."
    );
  }

  if (databaseUrl.includes("/brokermogger?") || databaseUrl.endsWith("/brokermogger")) {
    throw new Error(
      `Refusing to run integration tests against the development database: ${databaseUrl}`
    );
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
