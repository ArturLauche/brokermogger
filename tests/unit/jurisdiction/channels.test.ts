import { describe, expect, it } from "vitest";
import { legalRuleAllowsChannel } from "@/lib/jurisdiction/channels";
import { prepareLegalSource, legalSourceFromVersion } from "@/lib/jurisdiction/authoring";
import { syntheticLegalSource } from "../../helpers/legalSource";

describe("legal submission channels", () => {
  it("does not infer government-platform eligibility for ordinary or legacy legal rules", () => {
    expect(legalRuleAllowsChannel({}, "EMAIL")).toBe(true);
    expect(legalRuleAllowsChannel({}, "DROP")).toBe(false);
    expect(legalRuleAllowsChannel({ allowedChannels: ["DROP"] }, "DROP")).toBe(true);
    expect(legalRuleAllowsChannel({ allowedChannels: ["DROP"] }, "EMAIL")).toBe(false);
  });
  it.each(
    [[], ["UNKNOWN"], ["EMAIL", "EMAIL"], "EMAIL"].map((allowedChannels) => ({
      allowedChannels,
    }))
  )(
    "fails closed on malformed stored channel restrictions: $allowedChannels",
    ({ allowedChannels }) => {
      expect(legalRuleAllowsChannel({ allowedChannels }, "EMAIL")).toBe(false);
      expect(legalRuleAllowsChannel({ allowedChannels }, "DROP")).toBe(false);
    }
  );
  it("preserves a saved platform restriction through operator draft editing", () => {
    const prepared = prepareLegalSource({
      ...syntheticLegalSource(),
      allowedChannels: "DROP",
    });
    expect(prepared.content.verificationRequirements.allowedChannels).toEqual(["DROP"]);
    const source = legalSourceFromVersion(prepared.content);
    expect(source.allowedChannels).toBe("DROP");
    expect(
      prepareLegalSource(source).content.verificationRequirements.allowedChannels
    ).toEqual(["DROP"]);
  });
});
