import { describe, expect, it } from "vitest";

import {
  BULK_CREATE_WITHOUT_AGE_LIMIT,
  isAccountTooNewForBulk,
} from "@/lib/requests/fairUse";

describe("isAccountTooNewForBulk", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");

  it("allows bulk once the account is old enough", () => {
    expect(
      isAccountTooNewForBulk({
        createdAt: new Date("2026-08-20T12:00:00.000Z"),
        minimumAgeHours: 24,
        now,
      })
    ).toBe(false);
  });

  it("blocks bulk for a young account", () => {
    expect(
      isAccountTooNewForBulk({
        createdAt: new Date("2026-08-25T06:00:00.000Z"),
        minimumAgeHours: 24,
        now,
      })
    ).toBe(true);
  });

  it("does not block when the age gate is disabled", () => {
    expect(
      isAccountTooNewForBulk({
        createdAt: now,
        minimumAgeHours: 0,
        now,
      })
    ).toBe(false);
  });

  it("keeps the documented bulk threshold at five brokers", () => {
    expect(BULK_CREATE_WITHOUT_AGE_LIMIT).toBe(5);
  });
});
