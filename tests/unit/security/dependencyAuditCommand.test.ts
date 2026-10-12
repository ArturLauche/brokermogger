import { afterEach, expect, it, vi } from "vitest";

const scanner = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawnSync: scanner }));

const previousExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = previousExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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
