import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  config: { TRUSTED_PROXY_IP_HEADER: "none", RATE_LIMIT_ENABLED: true },
  log: { level: "silent", warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/config/env", () => ({ env: fixture.config }));
vi.mock("@/lib/observability/logger", () => ({ createLogger: () => fixture.log }));

const previousArgs = process.argv;
const previousExitCode = process.exitCode;
beforeEach(() => {
  process.exitCode = undefined;
  vi.clearAllMocks();
  fixture.config.TRUSTED_PROXY_IP_HEADER = "none";
});
afterEach(() => {
  process.argv = previousArgs;
  process.exitCode = previousExitCode;
  vi.resetModules();
});

it.each([[], ["--public"]])(
  "rejects an unsafe public configuration with flags %j",
  async (...flags: string[]) => {
    process.argv = ["node", "check-deployment.ts", ...flags];
    await import("@/scripts/check-deployment");
    expect(process.exitCode).toBe(1);
  }
);

it("requires a visible explicit opt-out for private single-user use", async () => {
  process.argv = ["node", "check-deployment.ts", "--single-user"];
  await import("@/scripts/check-deployment");
  expect(process.exitCode).toBeUndefined();
  expect(fixture.log.warn).toHaveBeenCalledWith(
    expect.stringContaining("NOT VERIFIED FOR PUBLIC USE")
  );
});

it("does not imply topology was attested after passing configuration checks", async () => {
  fixture.config.TRUSTED_PROXY_IP_HEADER = "x-real-ip";
  process.argv = ["node", "check-deployment.ts"];
  await import("@/scripts/check-deployment");
  expect(process.exitCode).toBeUndefined();
  expect(fixture.log.info).toHaveBeenCalledWith(
    expect.stringContaining("NETWORK TRUST NOT VERIFIED")
  );
});

it("rejects conflicting deployment modes", async () => {
  process.argv = ["node", "check-deployment.ts", "--public", "--single-user"];
  await import("@/scripts/check-deployment");
  expect(process.exitCode).toBe(1);
  expect(fixture.log.error).toHaveBeenCalledWith(expect.stringContaining("Usage"));
});
