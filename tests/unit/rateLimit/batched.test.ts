import { expect, it, vi } from "vitest";

vi.mock("@/lib/db/repositories/rateLimit", () => ({ incrementBuckets: vi.fn() }));

import { consumePolicies, magicLinkPerEmail, magicLinkPerIp } from "@/lib/rateLimit";

const inputs = [
  { policy: magicLinkPerEmail, key: "synthetic@example.org" },
  { policy: magicLinkPerIp, key: "synthetic-network" },
];
const now = new Date("2026-10-13T12:00:10Z");

it.each(
  [
    null as unknown as number[],
    undefined as unknown as number[],
    { length: 2, 0: 1, 1: 1 } as unknown as number[],
    [],
    [1],
    [1, 2, 3],
    [NaN, 1],
    [Infinity, 1],
    [-1, 1],
    [0, 1],
    [1.5, 1],
    Array<number>(2),
  ].map((counts) => ({ counts }))
)("rejects malformed counter results %# with a typed failure", async ({ counts }) => {
  await expect(consumePolicies(inputs, now, async () => counts)).rejects.toMatchObject({
    code: "INTERNAL_ERROR",
    status: 500,
  });
});

it("preserves each policy's result when the counter port is valid", async () => {
  const results = await consumePolicies(inputs, now, async () => [1, 11]);
  expect(results).toEqual([
    { allowed: true, remaining: 2, retryAfterSeconds: 0, limit: 3 },
    { allowed: false, remaining: 0, retryAfterSeconds: 3590, limit: 10 },
  ]);
});
