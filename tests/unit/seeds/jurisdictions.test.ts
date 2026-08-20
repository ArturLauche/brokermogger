/**
 * The jurisdiction catalogue is referenced by legal rules, templates and
 * broker coverage, so its keys and shape have to stay stable.
 */
import { describe, expect, it } from "vitest";

import { JURISDICTIONS } from "@/prisma/seeds/data/jurisdictions";

const EXPECTED_CODES = ["US-CA", "US-OTHER", "DE", "GB", "BR", "IN", "AU", "SG"];

describe("jurisdiction seed data", () => {
  it("ships exactly the eight supported jurisdictions", () => {
    expect(JURISDICTIONS.map((jurisdiction) => jurisdiction.code).sort()).toEqual(
      [...EXPECTED_CODES].sort()
    );
  });

  it("uses unique codes and sort orders", () => {
    const codes = JURISDICTIONS.map((jurisdiction) => jurisdiction.code);
    const sortOrders = JURISDICTIONS.map((jurisdiction) => jurisdiction.sortOrder);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(sortOrders).size).toBe(sortOrders.length);
  });

  it("carries a valid country code and a description", () => {
    for (const jurisdiction of JURISDICTIONS) {
      expect(jurisdiction.countryCode).toMatch(/^[A-Z]{2}$/);
      expect(jurisdiction.name.length).toBeGreaterThan(0);
      expect(jurisdiction.description.length).toBeGreaterThan(20);
    }
  });

  it("only sets a region for the sub national jurisdiction", () => {
    for (const jurisdiction of JURISDICTIONS) {
      if (jurisdiction.code === "US-CA") {
        expect(jurisdiction.region).toBe("CA");
      } else {
        expect(jurisdiction.region).toBeUndefined();
      }
    }
  });
});
