import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const libRoot = join(import.meta.dirname, "../../../lib");

function walkTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkTsFiles(full));
      continue;
    }
    if (full.endsWith(".ts")) files.push(full);
  }
  return files;
}

function posixRelative(file: string): string {
  return relative(join(libRoot, ".."), file).replaceAll("\\", "/");
}

describe("lib architecture boundaries", () => {
  const files = walkTsFiles(libRoot).map((file) => ({
    path: posixRelative(file),
    source: readFileSync(file, "utf8"),
  }));

  it("keeps Prisma client imports inside lib/db", () => {
    const offenders = files
      .filter((file) => !file.path.startsWith("lib/db/"))
      .filter((file) =>
        /(?:from\s+|import\s*\()\s*["']@\/lib\/db\/client["']/.test(file.source)
      );
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it("keeps process.env reads inside lib/config/env.ts", () => {
    const offenders = files
      .filter((file) => file.path !== "lib/config/env.ts")
      .filter((file) => /\bprocess\.env\b/.test(file.source));
    expect(offenders.map((file) => file.path)).toEqual([]);
  });

  it("keeps Next.js and app imports out of domain lib except the NextAuth adapters", () => {
    const nextImporters = files.filter((file) =>
      /(?:from\s+|import\s*\()\s*["']next(?:\/[^"']*)?["']/.test(file.source)
    );
    // NextAuth v5 `auth()`, `headers()`, `cookies()` and `redirect()` are
    // request-scoped. Fake-moving these modules out of lib/auth would break
    // every server action and layout that calls requireActor().
    expect(nextImporters.map((file) => file.path).sort()).toEqual([
      "lib/auth/guards.ts",
      "lib/auth/requestContext.ts",
    ]);

    const appImporters = files.filter(
      (file) =>
        /(?:from\s+|import\s*\()\s*["']@\/app(?:\/[^"']*)?["']/.test(file.source) ||
        /(?:from\s+|import\s*\()\s*["'](?:\.\.\/)+app\//.test(file.source)
    );
    expect(appImporters.map((file) => file.path)).toEqual([]);
  });
});
