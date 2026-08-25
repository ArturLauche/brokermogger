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

function satisfiesMinimum(version: string, engines: string): boolean {
  const minimum = /^>=(\d+\.\d+\.\d+)$/.exec(engines.trim());
  if (!minimum?.[1]) {
    throw new Error(`Unsupported engines range: ${engines}`);
  }
  const parsedVersion = parseSemver(version);
  const parsedMinimum = parseSemver(minimum[1]);
  if (!parsedVersion || !parsedMinimum) return false;
  return compareSemver(parsedVersion, parsedMinimum) >= 0;
}

describe("Node toolchain pins", () => {
  const nvmrc = readFileSync(resolve(root, ".nvmrc"), "utf8").trim();
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    engines?: { node?: string };
  };
  const engines = packageJson.engines?.node ?? "";
  const ciWorkflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
  const dockerfile = readFileSync(resolve(root, "docker/Dockerfile"), "utf8");

  it("pins .nvmrc to a patch version that satisfies package.json engines", () => {
    expect(parseSemver(nvmrc)).not.toBeNull();
    expect(engines).toMatch(/^>=\d+\.\d+\.\d+$/);
    expect(satisfiesMinimum(nvmrc, engines)).toBe(true);
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
    expect(fromImages).toEqual([
      `node:${nvmrc}-alpine`,
      `node:${nvmrc}-alpine`,
      `node:${nvmrc}-alpine`,
    ]);
    expect(dockerfile).toMatch(/npm_config_engine_strict=true/);
  });

  it("forces NODE_ENV=test in Vitest so a leftover production build cannot hide React.act", () => {
    const vitestConfig = readFileSync(resolve(root, "vitest.config.ts"), "utf8");
    expect(vitestConfig).toMatch(
      /Object\.assign\(process\.env,\s*\{\s*NODE_ENV:\s*["']test["']\s*\}\)/
    );
  });
});
