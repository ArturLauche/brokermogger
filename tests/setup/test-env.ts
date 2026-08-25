/**
 * Deterministic environment for every test project.
 *
 * Tests never talk to a real email provider, never enable external sending and
 * always use fixed cryptographic keys so that ciphertext fixtures stay stable.
 */
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: ".env", quiet: true });

const defaults: Record<string, string> = {
  APP_ENV: "development",
  NODE_ENV: "test",
  APP_BASE_URL: "http://localhost:3000",
  LOG_LEVEL: "silent",
  // Schema placeholder only. Never a live endpoint: the documented dev
  // container reaches Postgres via the `docker` host alias, not loopback.
  // Integration tests require TEST_DATABASE_URL from `.env` or the caller.
  DATABASE_URL:
    "postgresql://brokermogger:brokermogger@127.0.0.1:1/brokermogger_unit_unused?schema=public",
  AUTH_SECRET: "test-auth-secret-000000000000000000000000",
  AUTH_URL: "http://localhost:3000",
  AUTH_TRUST_HOST: "true",
  AUTH_MAGIC_LINK_TTL_SECONDS: "900",
  INSTANCE_ADMIN_EMAILS: "",
  ENCRYPTION_KEYS: "v1:dGVzdC1lbmNyeXB0aW9uLWtleS1kby1ub3QtdXNlAAA=",
  ENCRYPTION_ACTIVE_KEY_ID: "v1",
  BLIND_INDEX_KEY: "dGVzdC1ibGluZC1pbmRleC1rZXktZG8tbm90LXVzZQA=",
  EMAIL_PROVIDER: "mock",
  EMAIL_FROM: "Brokermogger <privacy@example.invalid>",
  EMAIL_REPLY_TO: "privacy-replies@example.invalid",
  MOCK_EMAIL_DIR: ".tmp/test-mail",
  ALLOW_EXTERNAL_SENDING: "false",
  STORAGE_BACKEND: "memory",
  STORAGE_LOCAL_DIR: ".tmp/test-storage",
  JOB_POLL_INTERVAL_MS: "50",
  JOB_BATCH_SIZE: "5",
  JOB_LOCK_SECONDS: "60",
  JOB_MAX_ATTEMPTS: "3",
  RATE_LIMIT_ENABLED: "true",
  SECURITY_CONTACT_EMAIL: "security@example.invalid",
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined || process.env[key] === "") {
    process.env[key] = value;
  }
}

// Integration tests must never point at the development database.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl;
}

export const TEST_DATABASE_URL = process.env.DATABASE_URL ?? "";
