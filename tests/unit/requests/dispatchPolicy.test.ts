import { describe, expect, it } from "vitest";
import {
  needsDeliveryReconciliation,
  SAFE_REPLAY_WINDOW_MS,
} from "@/lib/requests/dispatchPolicy";

describe("provider replay window", () => {
  it("starts when dispatch begins, not when a draft is approved", () => {
    expect(needsDeliveryReconciliation(null)).toBe(false);
  });
  it("stops replaying before the provider's 24-hour key expiry", () => {
    const start = new Date("2026-09-23T00:00:00Z");
    expect(
      needsDeliveryReconciliation(
        start,
        new Date(start.getTime() + SAFE_REPLAY_WINDOW_MS - 1)
      )
    ).toBe(false);
    expect(
      needsDeliveryReconciliation(
        start,
        new Date(start.getTime() + SAFE_REPLAY_WINDOW_MS)
      )
    ).toBe(true);
  });
});
