import { expect, it, vi } from "vitest";

import { consumePolicies } from "@/lib/rateLimit";

it("returns no results for no policies without using the default database port", async () => {
  await expect(consumePolicies([])).resolves.toEqual([]);
});

it("does not invoke a supplied counter port for an empty policy list", async () => {
  const increment = vi.fn(async () => {
    throw new Error("An empty policy list must not call its counter port.");
  });
  await expect(consumePolicies([], new Date(), increment)).resolves.toEqual([]);
  expect(increment).not.toHaveBeenCalled();
});
