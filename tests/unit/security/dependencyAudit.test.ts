import { expect, it } from "vitest";
import { evaluateDependencyAudit } from "@/scripts/dependency-audit/policy";
const now = new Date("2026-10-12T00:00:00Z");
const cause = {
  name: "braces",
  url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  severity: "high",
};
const report = {
  vulnerabilities: {
    braces: { severity: "high", nodes: ["node_modules/braces"], via: [cause] },
    micromatch: { severity: "high", nodes: ["node_modules/micromatch"], via: ["braces"] },
  },
};
const lock = {
  packages: {
    "node_modules/braces": { dev: true, version: "3.0.3" },
    "node_modules/micromatch": { dev: true, version: "4.0.8" },
  },
};
it("accepts only the reviewed dev-only advisory and its dependent causes", () => {
  expect(evaluateDependencyAudit(report, lock, now).blocking).toEqual([]);
  expect(evaluateDependencyAudit(report, lock, now).accepted).toEqual([
    "braces",
    "micromatch",
  ]);
});
it("expires without needing a code or configuration change", () => {
  expect(
    evaluateDependencyAudit(report, lock, new Date("2026-11-11T00:00:00Z")).blocking
  ).toEqual(["braces", "micromatch"]);
});
it("blocks a runtime copy even of the excepted package", () => {
  expect(
    evaluateDependencyAudit(
      report,
      { packages: { ...lock.packages, "node_modules/braces": { version: "3.0.3" } } },
      now
    ).blocking
  ).toEqual(["braces", "micromatch"]);
});
it("blocks unreviewed versions of the excepted package", () => {
  expect(
    evaluateDependencyAudit(
      report,
      {
        packages: {
          ...lock.packages,
          "node_modules/braces": { dev: true, version: "3.0.2" },
        },
      },
      now
    ).blocking
  ).toHaveLength(2);
});
it("blocks a new advisory even in an excepted dependency", () => {
  const changed = structuredClone(report);
  changed.vulnerabilities.braces.via.push({
    ...cause,
    url: "https://github.com/advisories/GHSA-new-unreviewed",
  });
  expect(evaluateDependencyAudit(changed, lock, now).blocking).toHaveLength(2);
});
it("blocks unrelated moderate findings", () => {
  const changed = {
    vulnerabilities: {
      ...report.vulnerabilities,
      other: {
        severity: "moderate",
        nodes: ["node_modules/other"],
        via: [
          {
            name: "other",
            severity: "moderate",
            url: "https://example.invalid/advisory",
          },
        ],
      },
    },
  };
  expect(evaluateDependencyAudit(changed, lock, now).blocking).toEqual(["other"]);
});
it("rejects malformed or missing scanner data", () => {
  expect(() => evaluateDependencyAudit({}, lock, now)).toThrow();
  expect(() => evaluateDependencyAudit(report, {}, now)).toThrow();
});
