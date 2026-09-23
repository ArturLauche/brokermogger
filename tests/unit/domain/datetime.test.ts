import { describe, expect, it } from "vitest";
import { createDateFormatter, formatIsoDate } from "@/lib/format/datetime";
import { timezoneSchema } from "@/lib/profiles/validation";
describe("account timezone display", () => {
  it("formats instants in the chosen timezone across daylight-saving boundaries", () => {
    const format = createDateFormatter("America/New_York");
    expect(format.formatStamp(new Date("2026-03-08T06:30:00Z"))).toContain("01:30");
    expect(format.formatStamp(new Date("2026-03-08T07:30:00Z"))).toContain("03:30");
    expect(format.formatDate(new Date("2026-01-01T00:30:00Z"))).toContain("31 Dec 2025");
  });
  it("rejects invalid new settings, tolerates invalid legacy values and preserves date-only boundaries", () => {
    expect(timezoneSchema.safeParse("Invented/Zone").success).toBe(false);
    expect(createDateFormatter("Invented/Zone").timeZone).toBe("UTC");
    expect(formatIsoDate(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });
});
