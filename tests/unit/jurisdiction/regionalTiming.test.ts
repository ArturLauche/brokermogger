import { describe, expect, it } from "vitest";
import { LEGAL_RULES } from "@/prisma/seeds/data/legal-rules";
import { readDeadlinePolicy } from "@/lib/jurisdiction/deadlines";

describe("regional timing does not borrow a neighbouring right's period", () => {
  it("limits Brazil's 15-day complete declaration to access", () => {
    const rules = LEGAL_RULES.filter((rule) => rule.jurisdictionCode === "BR");
    const access = rules.filter((rule) =>
      rule.versions[0]!.supportedRequestTypes.includes("ACCESS")
    );
    expect(access).toHaveLength(1);
    expect(readDeadlinePolicy(access[0]!.versions[0]!.deadlineRule)).toMatchObject({
      unit: "CALENDAR_DAYS",
      period: 15,
    });
    for (const rule of rules.filter(
      (rule) => !rule.versions[0]!.supportedRequestTypes.includes("ACCESS")
    ))
      expect(readDeadlinePolicy(rule.versions[0]!.deadlineRule)).toMatchObject({
        unit: "NONE",
        period: null,
      });
  });
  it("does not describe Australia's reasonable-period guidance as a fixed statutory clock for private brokers", () => {
    for (const rule of LEGAL_RULES.filter((rule) => rule.jurisdictionCode === "AU")) {
      expect(readDeadlinePolicy(rule.versions[0]!.deadlineRule)).toMatchObject({
        unit: "NONE",
        period: null,
      });
      expect(rule.versions[0]!.riskNotes).toMatch(/reasonable|marketing/i);
    }
  });
  it("distinguishes Singapore's 30-day notification from full access or correction completion", () => {
    const rule = LEGAL_RULES.find((rule) => rule.key === "pdpa-access-correction")!;
    const policy = readDeadlinePolicy(rule.versions[0]!.deadlineRule);
    expect(policy).toMatchObject({ unit: "NONE", period: null });
    expect(policy!.notes).toMatch(/30.*notif|notif.*30/i);
    expect(rule.versions[0]!.sourceUrl).toContain("pdpc.gov.sg");
  });
});
