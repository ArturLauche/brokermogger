#!/usr/bin/env tsx
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { evaluateDependencyAudit } from "./dependency-audit/policy";

// Always run the full upstream scan at the existing moderate threshold. A
// registry/network error or malformed report fails rather than looking clean.
const scan = spawnSync("npm", ["audit", "--json", "--audit-level=moderate"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
try {
  if (scan.error || scan.signal || scan.status === null || scan.status > 1)
    throw new Error("npm audit could not complete");
  const raw = JSON.parse(scan.stdout) as Record<string, unknown>;
  if (raw.error) throw new Error("npm audit returned a registry error");
  const result = evaluateDependencyAudit(
    raw,
    JSON.parse(readFileSync("package-lock.json", "utf8"))
  );
  if (result.accepted.length) {
    process.stderr.write(
      `Temporary dev-only exception: ${result.exception.advisoryUrl}; owner ${result.exception.owner}; expires ${result.exception.expiresAt}. Affected entries: ${result.accepted.join(", ")}. Evidence: ${result.exception.evidence}.\n`
    );
  }
  if (result.blocking.length) {
    process.stderr.write(`Dependency audit failed: ${result.blocking.join(", ")}.\n`);
    process.exitCode = 1;
  } else
    process.stdout.write(
      `Dependency security gate passed: no unaccepted moderate/high/critical advisories (${result.accepted.length} explicitly accepted dev-only entries).\n`
    );
} catch {
  process.stderr.write(
    "Dependency audit failed: scan, report or lockfile could not be verified.\n"
  );
  process.exitCode = 1;
}
