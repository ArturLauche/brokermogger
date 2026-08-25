import { describe, expect, it } from "vitest";

import {
  DEFAULT_SECURITY_ADVISORIES_URL,
  DEFAULT_SECURITY_CONTACT,
  isPlaceholderSecurityContact,
} from "@/lib/config/site";

describe("security contact placeholders", () => {
  it("treats compiled .invalid addresses as unset", () => {
    expect(isPlaceholderSecurityContact(DEFAULT_SECURITY_CONTACT)).toBe(true);
    expect(isPlaceholderSecurityContact("ops@example.org")).toBe(false);
  });

  it("points the fallback at the public GitHub advisories URL", () => {
    expect(DEFAULT_SECURITY_ADVISORIES_URL).toContain("/security/advisories");
  });
});
