import { describe, expect, it } from "vitest";

import { createKeyedTtlCache, createTtlCache } from "@/lib/cache/ttl";

describe("createTtlCache", () => {
  it("returns undefined before a value is set", () => {
    const cache = createTtlCache<number>(60_000);
    expect(cache.get()).toBeUndefined();
    cache.set(3);
    expect(cache.get()).toBe(3);
    cache.clear();
    expect(cache.get()).toBeUndefined();
  });

  it("coalesces concurrent misses onto one loader", async () => {
    const cache = createTtlCache<number>(60_000);
    let loads = 0;
    const loader = () => {
      loads += 1;
      return new Promise<number>((resolve) => {
        setTimeout(() => resolve(7), 15);
      });
    };
    const [first, second] = await Promise.all([
      cache.getOrLoad(loader),
      cache.getOrLoad(loader),
    ]);
    expect(first).toBe(7);
    expect(second).toBe(7);
    expect(loads).toBe(1);
  });

  it("retries after a failed load", async () => {
    const cache = createTtlCache<number>(60_000);
    let loads = 0;
    await expect(
      cache.getOrLoad(async () => {
        loads += 1;
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    await expect(
      cache.getOrLoad(async () => {
        loads += 1;
        return 1;
      })
    ).resolves.toBe(1);
    expect(loads).toBe(2);
  });
});

describe("createKeyedTtlCache", () => {
  it("evicts the oldest key when the bound is exceeded", () => {
    const cache = createKeyedTtlCache<string>(60_000, 2);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.set("c", "3");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe("2");
    expect(cache.get("c")).toBe("3");
    expect(cache.size()).toBe(2);
  });
});
