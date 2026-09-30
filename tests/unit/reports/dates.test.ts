import { describe, expect, it } from "vitest";
import {
  reportDateRange,
  reportInputSchema,
  startOfCalendarDay,
} from "@/lib/reports/validation";
import { randomUUID } from "node:crypto";

describe("account-local report calendar dates", () => {
  it("compares padded calendar years at the lower boundary and chooses the first repeated midnight", () => {
    expect(startOfCalendarDay("1000-01-01", "UTC").toISOString()).toBe(
      "1000-01-01T00:00:00.000Z"
    );
    expect(startOfCalendarDay("2020-11-01", "America/Havana").toISOString()).toBe(
      "2020-11-01T04:00:00.000Z"
    );
  });
  it("includes the entire final day and handles 23- and 25-hour days", () => {
    const spring = reportDateRange("2026-03-29", "2026-03-29", "Europe/Berlin");
    expect(spring.rangeStartAt.toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(spring.rangeEndAt.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    const fall = reportDateRange("2026-11-01", "2026-11-01", "America/New_York");
    expect(fall.rangeEndAt.getTime() - fall.rangeStartAt.getTime()).toBe(25 * 3_600_000);
    expect(startOfCalendarDay("2026-01-01", "Asia/Kathmandu").toISOString()).toBe(
      "2025-12-31T18:15:00.000Z"
    );
  });
  it("does not invent a historically skipped calendar day", () => {
    expect(() => startOfCalendarDay("2011-12-30", "Pacific/Apia")).toThrow(
      /does not exist/
    );
    const range = reportDateRange("2011-12-29", "2011-12-29", "Pacific/Apia");
    expect(range.rangeEndAt.toISOString()).toBe("2011-12-30T10:00:00.000Z");
  });
  it("rejects timestamps, invalid dates and ranges beyond 24 calendar months", () => {
    const input = {
      profileId: null,
      dateFrom: "2024-02-29",
      dateTo: "2026-02-28",
      format: "JSON",
      submissionKey: randomUUID(),
    };
    expect(reportInputSchema.safeParse(input).success).toBe(true);
    for (const dateTo of [
      "2026-03-01",
      "2026-02-30",
      "2026-01-01T12:00:00Z",
      "2023-01-01",
    ])
      expect(reportInputSchema.safeParse({ ...input, dateTo }).success).toBe(false);
  });
});
