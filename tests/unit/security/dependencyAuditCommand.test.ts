import { afterEach, expect, it, vi } from "vitest";

const scanner = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawnSync: scanner }));

const previousExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = previousExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.resetModules();
});
it("warns in CI before expiry while still blocking at the deadline", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-04T00:00:00Z"));
  process.exitCode = undefined;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  scanner.mockReturnValue({
    status: 1,
    signal: null,
    stdout: JSON.stringify({
      vulnerabilities: {
        braces: {
          severity: "high",
          nodes: ["node_modules/braces"],
          via: [
            {
              name: "braces",
              severity: "high",
              url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
            },
          ],
        },
      },
    }),
  });
  await import("@/scripts/audit-dependencies");
  expect(process.exitCode).toBeUndefined();
  expect(error).toHaveBeenCalledWith(expect.stringContaining("7 days remaining"));
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining("::warning title=Dependency exception expires soon::7 days")
  );
  vi.resetModules();
  vi.setSystemTime(new Date("2026-11-11T00:00:00Z"));
  await import("@/scripts/audit-dependencies");
  expect(process.exitCode).toBe(1);
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining("Dependency audit failed: braces")
  );
});

it("bounds a stalled scanner and fails closed without trusting partial output", async () => {
  process.exitCode = undefined;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const error = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  scanner.mockImplementation((_program, _args, options) => ({
    status: options.timeout ? null : 0,
    signal: options.timeout ? "SIGTERM" : null,
    error: options.timeout ? new Error("ETIMEDOUT") : undefined,
    stdout: JSON.stringify({ vulnerabilities: {} }),
  }));
  await import("@/scripts/audit-dependencies");
  expect(scanner).toHaveBeenLastCalledWith(
    "npm",
    expect.arrayContaining(["--include=dev"]),
    expect.objectContaining({ timeout: 300_000, killSignal: "SIGKILL" })
  );
  expect(process.exitCode).toBe(1);
  expect(error).toHaveBeenCalledWith(expect.stringContaining("could not be verified"));
});

it("blocks an unreviewed development advisory even in a production environment", async () => {
  vi.stubEnv("NODE_ENV", "production");
  process.exitCode = undefined;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  // npm omits development dependencies in this environment unless explicitly
  // included. A successful production-only scan must not satisfy the full gate.
  scanner.mockImplementation((_program, args: string[]) => {
    const includesDev = args.includes("--include=dev");
    return {
      status: includesDev ? 1 : 0,
      signal: null,
      stdout: JSON.stringify({
        vulnerabilities: includesDev
          ? {
              "unreviewed-tool": {
                severity: "high",
                nodes: ["node_modules/unreviewed-tool"],
                via: [
                  {
                    name: "unreviewed-tool",
                    severity: "high",
                    url: "https://example.invalid/unreviewed-advisory",
                  },
                ],
              },
            }
          : {},
      }),
    };
  });
  await import("@/scripts/audit-dependencies");
  expect(process.exitCode).toBe(1);
});
