import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", { spy: true });

const fixtureDirectory = mkdtempSync(join(tmpdir(), "brokermogger-cli-test-"));
const emptyEnvPath = join(fixtureDirectory, "empty.env");
const invalidEnvPath = join(fixtureDirectory, "invalid.env");
writeFileSync(emptyEnvPath, "");
writeFileSync(invalidEnvPath, "EMAIL_FROM=x\n");
afterAll(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

function check(flags: string[], overrides: Record<string, string> = {}) {
  const platformEnvironment = Object.fromEntries(
    ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR"].flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    })
  );
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/check-deployment.ts", ...flags],
    {
      encoding: "utf8",
      timeout: 10_000,
      killSignal: "SIGKILL",
      env: {
        ...platformEnvironment,
        DOTENV_CONFIG_PATH: emptyEnvPath,
        APP_ENV: "production",
        NODE_ENV: "production",
        LOG_LEVEL: "silent",
        DATABASE_URL: "postgresql://synthetic@localhost:1/diagnostic_unit_unused",
        APP_BASE_URL: "https://privacy.example.org",
        AUTH_URL: "https://privacy.example.org",
        AUTH_SECRET: randomBytes(32).toString("base64"),
        ENCRYPTION_KEYS: `v1:${randomBytes(32).toString("base64")}`,
        ENCRYPTION_ACTIVE_KEY_ID: "v1",
        BLIND_INDEX_KEY: randomBytes(32).toString("base64"),
        EMAIL_PROVIDER: "sandbox",
        EMAIL_FROM: "Brokermogger test <privacy@example.invalid>",
        EMAIL_REPLY_TO: "privacy-replies@example.invalid",
        EMAIL_SANDBOX_REDIRECT_TO: "synthetic@example.org",
        ALLOW_EXTERNAL_SENDING: "false",
        STORAGE_BACKEND: "local",
        STORAGE_LOCAL_DIR: fixtureDirectory,
        SECURITY_CONTACT_EMAIL: "security@example.invalid",
        TRUSTED_PROXY_IP_HEADER: "none",
        ALLOW_SHARED_AUTH_NETWORK_BUCKET: "false",
        RATE_LIMIT_ENABLED: "true",
        SKIP_ENV_VALIDATION: "false",
        ...overrides,
      },
    }
  );
  if (result.error || result.signal || result.status === null)
    throw new Error(
      "Deployment CLI subprocess did not complete within its 10,000 ms budget or was interrupted."
    );
  return result;
}

// One test launches two children: allow both 10s budgets plus runner overhead.
// These are isolated local CLI checks; neither the network nor a database is used.
describe("production deployment CLI", { timeout: 30_000, concurrent: false }, () => {
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

  it("does not inherit application configuration from the parent process", () => {
    const previous = process.env.EMAIL_FROM;
    process.env.EMAIL_FROM = "x";
    try {
      expect(check([], { TRUSTED_PROXY_IP_HEADER: "x-real-ip" }).status).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.EMAIL_FROM;
      else process.env.EMAIL_FROM = previous;
    }
  });

  it("does not load application configuration from a parent dotenv file", () => {
    const previousSender = process.env.EMAIL_FROM;
    const previousEnvPath = process.env.DOTENV_CONFIG_PATH;
    delete process.env.EMAIL_FROM;
    process.env.DOTENV_CONFIG_PATH = invalidEnvPath;
    try {
      expect(check([], { TRUSTED_PROXY_IP_HEADER: "x-real-ip" }).status).toBe(0);
    } finally {
      if (previousSender === undefined) delete process.env.EMAIL_FROM;
      else process.env.EMAIL_FROM = previousSender;
      if (previousEnvPath === undefined) delete process.env.DOTENV_CONFIG_PATH;
      else process.env.DOTENV_CONFIG_PATH = previousEnvPath;
    }
  });

  it("explains a timed-out subprocess instead of asserting against a null status", () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      pid: 0,
      output: [null, "", ""],
      stdout: "",
      stderr: "",
      status: null,
      signal: "SIGKILL",
      error: Object.assign(new Error("Synthetic process timeout."), {
        code: "ETIMEDOUT",
      }),
    });
    expect(() => check([])).toThrow("Deployment CLI subprocess did not complete");
  });
});
