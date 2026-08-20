#!/usr/bin/env tsx
/**
 * Fails when a documented environment variable is missing from `.env.example`
 * or when `lib/config/env.ts` introduces a key that is not listed there.
 */
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const example = readFileSync(resolve(root, ".env.example"), "utf8");
const envSource = readFileSync(resolve(root, "lib/config/env.ts"), "utf8");

const exampleKeys = new Set(
  example
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => line.slice(0, line.indexOf("=")))
);

const schemaBlock = envSource.slice(
  envSource.indexOf("const rawSchema"),
  envSource.indexOf("export type RawEnv")
);
const schemaKeys = new Set(
  [...schemaBlock.matchAll(/\b([A-Z][A-Z0-9_]+):/g)].map((match) => match[1] ?? "")
);
schemaKeys.delete("");

const missingFromExample = [...schemaKeys].filter((key) => !exampleKeys.has(key));
const extraInExample = [...exampleKeys].filter((key) => !schemaKeys.has(key));

if (missingFromExample.length > 0 || extraInExample.length > 0) {
  console.error("Environment documentation is out of sync.");
  if (missingFromExample.length > 0) {
    console.error(
      "In env.ts but missing from .env.example:",
      missingFromExample.join(", ")
    );
  }
  if (extraInExample.length > 0) {
    console.error("In .env.example but not in env.ts:", extraInExample.join(", "));
  }
  process.exitCode = 1;
} else {
  console.log(`Checked ${schemaKeys.size} environment variables.`);
}
