import { pickActiveProfile } from "@/lib/profiles/resolveActive";

describe("pickActiveProfile", () => {
  const profiles = [
    { id: "secondary", isPrimary: false, displayName: "Secondary" },
    { id: "primary", isPrimary: true, displayName: "Primary" },
  ];

  it("prefers the cookie id when it still belongs to the actor", () => {
    expect(pickActiveProfile(profiles, "secondary")?.id).toBe("secondary");
  });

  it("falls back to the primary profile when the cookie is unknown", () => {
    expect(pickActiveProfile(profiles, "missing")?.id).toBe("primary");
  });

  it("falls back to the first profile when none is primary", () => {
    const withoutPrimary = [{ id: "only", isPrimary: false }];
    expect(pickActiveProfile(withoutPrimary, null)?.id).toBe("only");
  });

  it("returns null when the actor has no profiles", () => {
    expect(pickActiveProfile([], "anything")).toBeNull();
  });
});
