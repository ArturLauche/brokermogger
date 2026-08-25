import { describe, expect, it } from "vitest";

import {
  BULK_CREATE_WITHOUT_AGE_LIMIT,
  MAX_BROKERS_PER_WORKFLOW,
  assertBrokerSelectionSize,
  isAccountTooNewForBulk,
  normalizeBrokerIds,
} from "@/lib/requests/fairUse";
import { ValidationError } from "@/lib/core/errors";

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

describe("normalizeBrokerIds", () => {
  it("drops duplicates while keeping first-seen order", () => {
    expect(normalizeBrokerIds(["b-2", "b-1", "b-2", " b-1 "])).toEqual(["b-2", "b-1"]);
  });

  it("drops empty values", () => {
    expect(normalizeBrokerIds(["", "  ", "b-1"])).toEqual(["b-1"]);
  });
});

describe("assertBrokerSelectionSize", () => {
  it("rejects an empty selection and a payload above the workflow ceiling", () => {
    expect(() => assertBrokerSelectionSize(0)).toThrow(ValidationError);
    expect(() => assertBrokerSelectionSize(MAX_BROKERS_PER_WORKFLOW + 1)).toThrow(
      ValidationError
    );
    expect(MAX_BROKERS_PER_WORKFLOW).toBe(1000);
  });
});
