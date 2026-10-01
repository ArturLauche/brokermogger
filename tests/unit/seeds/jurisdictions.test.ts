/**
 * The jurisdiction catalogue is referenced by legal rules, templates and
 * broker coverage, so its keys and shape have to stay stable.
 */
import { describe, expect, it } from "vitest";

import { JURISDICTIONS } from "@/prisma/seeds/data/jurisdictions";

const GDPR_CODES = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IS",
  "IE",
  "IT",
  "LV",
  "LI",
  "LT",
  "LU",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
];
const STATE_CODES = [
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "IN",
  "IA",
  "KY",
  "MD",
  "MN",
  "MT",
  "NE",
  "NH",
  "NJ",
  "OR",
  "RI",
  "TN",
  "TX",
  "UT",
  "VA",
];
const EXPECTED_CODES = [
  ...STATE_CODES.map((region) => `US-${region}`),
  "US-AL",
  "US-LA",
  "US-OK",
  "US-OTHER",
  ...GDPR_CODES,
  "GB",
  "BR",
  "IN",
  "AU",
  "SG",
];

describe("jurisdiction seed data", () => {
  it("ships explicit packs for all 30 EU/EEA countries and the existing other locations", () => {
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
      if (jurisdiction.countryCode === "US" && jurisdiction.code !== "US-OTHER") {
        expect(jurisdiction.region).toBe(jurisdiction.code.slice(3));
      } else {
        expect(jurisdiction.region).toBeUndefined();
      }
    }
  });
});
