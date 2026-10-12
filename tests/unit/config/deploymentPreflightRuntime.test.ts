import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

function check(flags: string[], overrides: Record<string, string> = {}) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/check-deployment.ts", ...flags],
    {
      encoding: "utf8",
      timeout: 10_000,
      env: {
        ...process.env,
        APP_ENV: "production",
        NODE_ENV: "production",
        LOG_LEVEL: "silent",
        DATABASE_URL: "postgresql://synthetic@localhost:1/diagnostic_unit_unused",
        APP_BASE_URL: "https://privacy.example.org",
        AUTH_SECRET: randomBytes(32).toString("base64"),
        ENCRYPTION_KEYS: `v1:${randomBytes(32).toString("base64")}`,
        ENCRYPTION_ACTIVE_KEY_ID: "v1",
        BLIND_INDEX_KEY: randomBytes(32).toString("base64"),
        EMAIL_PROVIDER: "sandbox",
        EMAIL_SANDBOX_REDIRECT_TO: "synthetic@example.org",
        ALLOW_EXTERNAL_SENDING: "false",
        STORAGE_BACKEND: "local",
        TRUSTED_PROXY_IP_HEADER: "none",
        ALLOW_SHARED_AUTH_NETWORK_BUCKET: "false",
        RATE_LIMIT_ENABLED: "true",
        SKIP_ENV_VALIDATION: "false",
        ...overrides,
      },
    }
  );
}

it("explains invalid production private use without crashing before its advisory", () => {
  const result = check(["--single-user"]);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("NOT VERIFIED FOR PUBLIC USE");
  expect(result.stdout).toContain("configuration could not be validated");
  expect(result.stderr).not.toMatch(
    /at (getEnv|buildEnv)|Invalid environment configuration/
  );
});

it("permits acknowledged private use while preserving strict public diagnostics", () => {
  const config = { ALLOW_SHARED_AUTH_NETWORK_BUCKET: "true" };
  const privateUse = check(["--single-user"], config);
  expect(privateUse.status).toBe(0);
  expect(privateUse.stdout).toContain("NOT VERIFIED FOR PUBLIC USE");
  expect(check([], config).status).toBe(1);
});

it("accepts production proxy configuration without claiming network verification", () => {
  const result = check([], { TRUSTED_PROXY_IP_HEADER: "x-real-ip" });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("NETWORK TRUST NOT VERIFIED");
});

it("refuses disabled production enforcement even in acknowledged private mode", () => {
  const result = check(["--single-user"], {
    ALLOW_SHARED_AUTH_NETWORK_BUCKET: "true",
    RATE_LIMIT_ENABLED: "false",
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("configuration could not be validated");
});

it("does not log configured values embedded in validation exception messages", () => {
  const sentinel = "synthetic-private-config-value";
  const result = check([], {
    TRUSTED_PROXY_IP_HEADER: "x-real-ip",
    ENCRYPTION_ACTIVE_KEY_ID: sentinel,
  });
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).not.toContain(sentinel);
  expect(result.stdout).toContain("configuration could not be validated");
});
