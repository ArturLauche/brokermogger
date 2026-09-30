import { describe, expect, it } from "vitest";
import {
  calendarMonthsFrom,
  deadlinePolicySchema,
  responseTarget,
} from "@/lib/jurisdiction/deadlines";
import {
  GDPR_RESPONSE_POLICY,
  CCPA_RESPONSE_POLICY,
  CCPA_OPT_OUT_POLICY,
} from "@/prisma/seeds/data/deadline-policies";

const calendar = {
  validFrom: "2024-01-01",
  validThrough: "2026-12-31",
  holidays: ["2026-05-25"],
  nonWorkingWeekdays: [0, 6],
  sourceUrl: "https://www.gov.uk/bank-holidays",
  reviewedOn: "2026-09-30",
  verified: true,
};
describe("receipt-based response targets", () => {
  it("uses the corresponding calendar date, clamped to the last day of a shorter month", () => {
    expect(calendarMonthsFrom("2024-01-31", 1)).toBe("2024-02-29");
    expect(calendarMonthsFrom("2025-01-31", 1)).toBe("2025-02-28");
    expect(calendarMonthsFrom("2026-08-31", 1)).toBe("2026-09-30");
    expect(calendarMonthsFrom("2026-03-31", 1)).toBe("2026-04-30");
    expect(() => calendarMonthsFrom("2026-02-30", 1)).toThrow(/valid calendar date/);
  });

  it("waits for submission, never invents a legacy 30-day clock or applies an extension", () => {
    expect(
      responseTarget({ policy: GDPR_RESPONSE_POLICY, timeZone: "UTC" }).deadlineAt
    ).toBeNull();
    const legacy = responseTarget({
      policy: { baseDays: 30, dayType: "CALENDAR", verified: true },
      receiptOn: "2026-01-31",
      timeZone: "UTC",
    });
    expect(legacy.deadlineAt).toBeNull();
    expect(legacy.deadlineNote).toMatch(/requires review/);
    const current = responseTarget({
      policy: { policy: { ...GDPR_RESPONSE_POLICY, calendar } },
      receiptOn: "2026-03-05",
      timeZone: "UTC",
    });
    expect(current.deadlineOn?.toISOString().slice(0, 10)).toBe("2026-04-06"); // Easter Sunday, next working day; only declared holidays are applied.
    expect(current.deadlineIsEstimate).toBe(false);
  });

  it("excludes declared holidays and non-working weekdays and labels incomplete coverage", () => {
    const input = {
      policy: { ...CCPA_OPT_OUT_POLICY, period: 1, calendar },
      receiptOn: "2026-05-22",
      timeZone: "UTC",
    };
    const exact = responseTarget(input);
    expect(exact.deadlineOn?.toISOString().slice(0, 10)).toBe("2026-05-26");
    expect(exact.deadlineIsEstimate).toBe(false);
    const unknown = responseTarget({
      ...input,
      policy: { ...input.policy, calendar: null },
    });
    expect(unknown.deadlineOn?.toISOString().slice(0, 10)).toBe("2026-05-25");
    expect(unknown.deadlineIsEstimate).toBe(true);
    expect(unknown.deadlineNote).toMatch(/unverified or incomplete/);
    const expired = responseTarget({
      ...input,
      policy: {
        ...input.policy,
        calendar: { ...calendar, validThrough: "2026-05-22", holidays: [] },
      },
    });
    expect(expired.deadlineIsEstimate).toBe(true);
  });

  it("rolls month-end weekends and holidays forward only when the sourced policy requires it", () => {
    const result = responseTarget({
      policy: { ...GDPR_RESPONSE_POLICY, calendar },
      receiptOn: "2026-04-24",
      timeZone: "Europe/London",
    });
    expect(result.deadlineOn?.toISOString().slice(0, 10)).toBe("2026-05-26");
    const calendarDays = responseTarget({
      policy: { ...CCPA_RESPONSE_POLICY, period: 1 },
      receiptOn: "2026-05-22",
      timeZone: "UTC",
    });
    expect(calendarDays.deadlineOn?.toISOString().slice(0, 10)).toBe("2026-05-23");
  });

  it("keeps date-only manual submissions and reminder cutoffs correct across timezones and DST", () => {
    const result = responseTarget({
      policy: { ...CCPA_RESPONSE_POLICY, period: 1 },
      submittedOn: "2026-03-28",
      timeZone: "Europe/Berlin",
    });
    expect(result.deadlineOn?.toISOString().slice(0, 10)).toBe("2026-03-29");
    expect(result.deadlineAt?.toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(result.deadlineBasis).toBe("DISPATCH_ESTIMATE");
    expect(result.deadlineIsEstimate).toBe(true);
    const provider = responseTarget({
      policy: CCPA_RESPONSE_POLICY,
      providerDeliveredAt: new Date("2026-01-02T01:00:00Z"),
      timeZone: "America/Los_Angeles",
    });
    expect(provider.deadlineAnchorOn?.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(provider.deadlineBasis).toBe("PROVIDER_DELIVERY_ESTIMATE");
    expect(
      responseTarget({
        policy: CCPA_RESPONSE_POLICY,
        dispatchedAt: new Date(),
        simulated: true,
        timeZone: "UTC",
      }).deadlineBasis
    ).toBe("SIMULATED_DISPATCH");
  });

  it("records receipt without claiming a fixed deadline when the policy has none", () => {
    const result = responseTarget({
      policy: { ...CCPA_RESPONSE_POLICY, unit: "NONE", period: null, extension: null },
      receiptOn: "2026-09-30",
      timeZone: "UTC",
    });
    expect(result.deadlineAt).toBeNull();
    expect(result.deadlineBasis).toBe("RECORDED_RECEIPT");
    expect(result.deadlineAnchorOn?.toISOString().slice(0, 10)).toBe("2026-09-30");
  });

  it("rejects malformed calendars and periods and does not break dispatch for an unrepresentable calculated date", () => {
    for (const change of [
      { period: null },
      { sourceUrl: "not-a-url" },
      { period: 25 },
      { extension: { ...GDPR_RESPONSE_POLICY.extension!, period: 25 } },
      { calendar: { ...calendar, holidays: ["2027-01-01"] } },
      { calendar: { ...calendar, nonWorkingWeekdays: [0, 1, 2, 3, 4, 5, 6] } },
    ])
      expect(
        deadlinePolicySchema.safeParse({ ...GDPR_RESPONSE_POLICY, ...change }).success
      ).toBe(false);
    const skipped = responseTarget({
      policy: { ...CCPA_RESPONSE_POLICY, period: 1 },
      receiptOn: "2011-12-29",
      timeZone: "Pacific/Apia",
    });
    expect(skipped.deadlineAt).toBeNull();
    expect(skipped.deadlineNote).toMatch(/cannot be represented/);
  });
});
