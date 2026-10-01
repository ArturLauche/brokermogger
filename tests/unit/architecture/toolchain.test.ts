import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

function parseSemver(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** jsdom 30's published engines: `^22.22.2 || ^24.15.0 || >=26.0.0`. */
const JSDOM_ENGINES = "^22.22.2 || ^24.15.0 || >=26.0.0";

function satisfiesDisjointEngines(version: string, engines: string): boolean {
  const parsed = parseSemver(version);
  if (!parsed) return false;
  const clauses = engines.split("||").map((clause) => clause.trim());
  return clauses.some((clause) => {
    const caret = /^\^(\d+\.\d+\.\d+)$/.exec(clause);
    if (caret?.[1]) {
      const minimum = parseSemver(caret[1]);
      if (!minimum) return false;
      return parsed[0] === minimum[0] && compareSemver(parsed, minimum) >= 0;
    }
    const gte = /^>=(\d+\.\d+\.\d+)$/.exec(clause);
    if (gte?.[1]) {
      const minimum = parseSemver(gte[1]);
      if (!minimum) return false;
      return compareSemver(parsed, minimum) >= 0;
    }
    return false;
  });
}

describe("Node toolchain pins", () => {
  const nvmrc = readFileSync(resolve(root, ".nvmrc"), "utf8").trim();
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    engines?: { node?: string };
  };
  const engines = packageJson.engines?.node ?? "";
  const ciWorkflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
  const dockerfile = readFileSync(resolve(root, "docker/Dockerfile"), "utf8");

  it("pins .nvmrc to a patch version that satisfies the jsdom-compatible engines range", () => {
    expect(parseSemver(nvmrc)).not.toBeNull();
    expect(engines).toBe(JSDOM_ENGINES);
    expect(satisfiesDisjointEngines(nvmrc, engines)).toBe(true);
  });

  it("installs CI Node from .nvmrc and fails the job if engines are not met", () => {
    expect(ciWorkflow).toMatch(/node-version-file:\s*["']\.nvmrc["']/);
    expect(ciWorkflow).not.toMatch(/node-version:\s*["']22["']/);
    expect(ciWorkflow).toMatch(/npm_config_engine_strict:\s*["']true["']/);
  });

  it("builds Docker images on the same Node patch as .nvmrc", () => {
    const fromImages = [...dockerfile.matchAll(/^FROM\s+(\S+)/gm)].map(
      (match) => match[1] ?? ""
    );
    const nodeImages = fromImages.filter((image) => image.startsWith("node:"));
    expect(nodeImages.length).toBeGreaterThan(0);
    expect(nodeImages.every((image) => image === `node:${nvmrc}-alpine`)).toBe(true);
    expect(dockerfile).toMatch(/npm_config_engine_strict=true/);
  });

  it("forces NODE_ENV=test in Vitest so a leftover production build cannot hide React.act", () => {
    const vitestConfig = readFileSync(resolve(root, "vitest.config.mts"), "utf8");
    expect(vitestConfig).toMatch(
      /Object\.assign\(process\.env,\s*\{\s*NODE_ENV:\s*["']test["']\s*\}\)/
    );
  });

  it("keeps npm test scripts portable to Windows cmd.exe", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8")
    ) as {
      scripts?: Record<string, string>;
    };
    for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
      if (!name.startsWith("test")) continue;
      expect(command, name).not.toMatch(/^[A-Z_]+=\S+\s/);
    }
  });

  it("publishes Docker images only from main and version-tag push events", () => {
    const workflow = readFileSync(
      resolve(root, ".github/workflows/docker-image.yml"),
      "utf8"
    );
    expect(workflow).toMatch(/if:\s*github\.event_name == 'push'/);
    expect(workflow).toMatch(/push:\s*\$\{\{\s*github\.event_name == 'push'\s*\}\}/);
    expect(workflow).not.toMatch(/github\.event_name != 'pull_request'/);
  });

  it("does not default tests to loopback Postgres on port 5433", () => {
    const testEnv = readFileSync(resolve(root, "tests/setup/test-env.ts"), "utf8");
    expect(testEnv).not.toMatch(/127\.0\.0\.1:5433/);
    expect(testEnv).not.toMatch(/TEST_DATABASE_URL:\s*\n\s*"postgresql:/);
  });
});
