import { describe, expect, it } from "vitest";
import {
  legalSourceSchema,
  prepareLegalSource,
  validateLegalPublication,
  legalSourceFromVersion,
} from "@/lib/jurisdiction/authoring";
import { syntheticLegalSource } from "../../helpers/legalSource";

describe("sourced legal authoring", () => {
  it("renders the full declared 400-character legal basis safely without inventing a deadline", () => {
    const prepared = prepareLegalSource({
      ...syntheticLegalSource(),
      legalBasisText: "x".repeat(400),
    });
    expect(prepared.previews[0]!.body).toContain("x".repeat(400));
    expect(prepared.timingPreview.deadlineAt).toBeNull();
    for (const value of [
      "x".repeat(401),
      "Law\nBcc: recipient",
      "Article \u202e17",
      "<script>alert(1)</script>",
    ])
      expect(
        legalSourceSchema.safeParse({ ...syntheticLegalSource(), legalBasisText: value })
          .success
      ).toBe(false);
  });
  it("validates primary sources, review dates, confidence and unverified timing at the boundary", () => {
    for (const change of [
      { sourceUrl: "https://example.org/law" },
      { sourceUrl: "javascript:alert(1)" },
      { sourceUrl: "https://name:secret@eur-lex.europa.eu/" },
      { lastReviewedOn: "9998-01-01" },
      { requiresLegalReview: "false" },
      { confidence: "MEDIUM", requiresLegalReview: "false", deadlineVerified: "false" },
      { supportedRequestTypes: "DELETION,UNKNOWN" },
      { templateClauses: "made-up-clause" },
      { verificationFlags: "collect-birth-date" },
    ])
      expect(
        legalSourceSchema.safeParse({ ...syntheticLegalSource(), ...change }).success
      ).toBe(false);
    expect(
      legalSourceSchema.safeParse({
        ...syntheticLegalSource(),
        confidence: "MEDIUM",
        requiresLegalReview: "false",
        deadlineVerified: "true",
      }).success
    ).toBe(true);
  });
  it("keeps calendar months distinct and rejects incompatible timing configuration", () => {
    const source = {
      ...syntheticLegalSource(),
      deadlineUnit: "CALENDAR_MONTHS",
      deadlinePeriod: "1",
      deadlineVerified: "true",
    };
    const prepared = prepareLegalSource(source);
    expect(prepared.content.deadlineDays).toBeNull();
    expect(prepared.timingPreview.deadlineOn?.toISOString().slice(0, 10)).toBe(
      "2026-02-28"
    );
    for (const change of [
      { deadlinePeriod: "" },
      { deadlinePeriod: "25" },
      { deadlineCalendar: "{broken" },
      {
        deadlineCalendar: JSON.stringify({
          validFrom: "2026-01-01",
          validThrough: "2026-12-31",
          holidays: [],
          nonWorkingWeekdays: [0, 6],
          sourceUrl: "https://example.org/calendar",
          reviewedOn: syntheticLegalSource().lastReviewedOn,
          verified: true,
        }),
      },
      {
        deadlineExtension:
          '{"unit":"CALENDAR_MONTHS","period":25,"noticeRequired":true,"conditions":"Only with a notice"}',
      },
      { deadlineUnit: "NONE" },
    ])
      expect(legalSourceSchema.safeParse({ ...source, ...change }).success).toBe(false);
    expect(
      legalSourceSchema.safeParse({
        ...syntheticLegalSource(),
        deadlineExtension:
          '{"unit":"CALENDAR_DAYS","period":45,"noticeRequired":true,"conditions":"A notified extension"}',
      }).success
    ).toBe(false);
  });
  it("compares actual effective instants rather than their string formatting", () => {
    expect(
      legalSourceSchema.safeParse({
        ...syntheticLegalSource(),
        effectiveFrom: "2026-01-01T00:00:00Z",
        effectiveUntil: "2026-01-01T00:00:00.001Z",
      }).success
    ).toBe(true);
    expect(
      legalSourceSchema.safeParse({
        ...syntheticLegalSource(),
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveUntil: "2026-01-01T00:00:00Z",
      }).success
    ).toBe(false);
  });
  it("binds previews to the complete saved configuration and requires publication review notes", () => {
    const source = syntheticLegalSource();
    const first = prepareLegalSource(source);
    for (const change of [
      { riskNotes: source.riskNotes + " Changed applicability." },
      { deadlineUnit: "CALENDAR_DAYS", deadlinePeriod: "45" },
      { sourceUrl: "https://www.edpb.europa.eu/about-edpb/our-members_en" },
      { verificationFlags: "accountRequired" },
      { effectiveFrom: "2020-01-01T00:00:00.000Z" },
    ])
      expect(prepareLegalSource({ ...source, ...change }).checksum).not.toBe(
        first.checksum
      );
    expect(validateLegalPublication(source).checksum).toBe(first.checksum);
    expect(() => validateLegalPublication({ ...source, changeNotes: "" })).toThrow(
      /before publication/
    );
    expect(prepareLegalSource({ ...source, changeNotes: "" })).toBeTruthy();
  });
  it("preserves historical content but refuses to execute or publish guessed legacy timing", () => {
    const content = prepareLegalSource(syntheticLegalSource()).content;
    const restored = legalSourceFromVersion(content);
    expect(prepareLegalSource(restored).checksum).toBe(
      prepareLegalSource(syntheticLegalSource()).checksum
    );
    const legacy = legalSourceFromVersion({
      ...content,
      deadlineRule: { baseDays: 30, verified: true },
    });
    expect(legacy.deadlineVerified).toBe("false");
    expect(legacy.deadlineCalendar).toContain("baseDays");
    expect(() => validateLegalPublication(legacy)).toThrow(/not valid/);
  });
});
