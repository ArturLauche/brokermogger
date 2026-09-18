import { describe, expect, it } from "vitest";

import { sanitiseHeaderValue } from "@/lib/security/sanitize";

describe("header sanitization", () => {
  it("rejects repeated invalid inputs without regular-expression state leaking", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(() => sanitiseHeaderValue("Name\nOther", "name")).toThrow();
    }
  });
});
