/** Synthetic calendar benchmark. No instance configuration, identifiers or database reads. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { calendarDateRange } from "@/lib/format/calendar";

const mode = z.enum(["baseline", "optimized"]).parse(process.argv[2] ?? "optimized");
const zones = [
  "UTC",
  "Europe/Berlin",
  "America/New_York",
  "Pacific/Apia",
  "Asia/Kolkata",
];

// The pre-optimization implementation is retained here only for reproducible measurement.
function originalStart(day: string, timeZone: string): Date {
  const format = (value: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const part = (type: string) => parts.find((value) => value.type === type)!.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  };
  const utc = Date.parse(`${day}T00:00:00Z`);
  let low = utc - 2 * 86400_000;
  let high = utc + 2 * 86400_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (format(new Date(middle)) < day) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}
function originalRange(day: string, zone: string) {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    rangeStartAt: originalStart(day, zone),
    rangeEndAt: originalStart(next.toISOString().slice(0, 10), zone),
  };
}

const results = [];
for (const count of [100, 1000, 10000]) {
  for (let run = 0; run < 3; run += 1) {
    globalThis.gc?.();
    const before = process.memoryUsage();
    const samples: number[] = [];
    const start = performance.now();
    for (let i = 0; i < count; i += 1) {
      const day = `2026-${i % 2 ? "03" : "10"}-${String((i % 28) + 1).padStart(2, "0")}`;
      const zone = zones[i % zones.length]!;
      const began = performance.now();
      const range =
        mode === "baseline"
          ? originalRange(day, zone)
          : calendarDateRange(day, day, zone);
      if (range.rangeEndAt <= range.rangeStartAt)
        throw new Error("Invalid synthetic calendar range.");
      samples.push(performance.now() - began);
    }
    samples.sort((a, b) => a - b);
    results.push({
      count,
      run,
      elapsedMs: performance.now() - start,
      p50Ms: samples[Math.floor(count * 0.5)],
      p95Ms: samples[Math.floor(count * 0.95)],
      heapDeltaBytes: process.memoryUsage().heapUsed - before.heapUsed,
      rssBytes: process.memoryUsage().rss,
    });
  }
}
const sourceHash = createHash("sha256")
  .update(readFileSync("lib/format/calendar.ts"))
  .update(readFileSync("lib/format/datetime.ts"))
  .digest("hex");
const report = {
  mode,
  node: process.version,
  icu: process.versions.icu,
  sourceHash,
  results,
};
mkdirSync(".tmp/benchmarks", { recursive: true });
writeFileSync(
  `.tmp/benchmarks/calendar-${mode}.json`,
  JSON.stringify(report, null, 2) + "\n"
);
process.stdout.write(JSON.stringify(report) + "\n");
