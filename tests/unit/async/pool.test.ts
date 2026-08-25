import { describe, expect, it } from "vitest";

import { mapPool } from "@/lib/async/pool";

describe("mapPool", () => {
  it("preserves input order with bounded concurrency", async () => {
    const started: number[] = [];
    const result = await mapPool([3, 1, 2], 2, async (value) => {
      started.push(value);
      await new Promise((resolve) => {
        setTimeout(resolve, value * 5);
      });
      return value * 10;
    });
    expect(result).toEqual([30, 10, 20]);
    expect(started).toHaveLength(3);
  });

  it("returns an empty array for empty input", async () => {
    expect(await mapPool([], 4, async (value) => value)).toEqual([]);
  });
});
