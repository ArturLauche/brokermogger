import { describe, expect, it } from "vitest";

import { CONSENT_STATEMENT, HOUSEHOLD_ADULT_CONFIRMATION } from "@/lib/household/service";
import { APPROVAL_CHECKBOX_LABEL } from "@/lib/requests/labels";

describe("product copy that is part of the contract", () => {
  it("keeps the approval checkbox sentence exact", () => {
    expect(APPROVAL_CHECKBOX_LABEL).toBe(
      "I have reviewed the profile, consent status, destination, legal basis and final request text."
    );
  });

  it("requires an adult confirmation before household invites", () => {
    expect(HOUSEHOLD_ADULT_CONFIRMATION).toMatch(/adult/i);
    expect(CONSENT_STATEMENT).toMatch(/not a law firm/i);
  });
});
