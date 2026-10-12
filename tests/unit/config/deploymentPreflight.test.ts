import { expect, it } from "vitest";
import { deploymentPreflight } from "@/lib/config/deploymentPreflight";

it("warns about shared login denial without preventing local/single-user use", () => {
  const result = deploymentPreflight({
    TRUSTED_PROXY_IP_HEADER: "none",
    RATE_LIMIT_ENABLED: true,
  });
  expect(result.ready).toBe(true);
  expect(result.warnings.join(" ")).toContain("entire instance");
});
it("fails an explicitly public multi-user preflight without trusted attribution", () => {
  expect(
    deploymentPreflight(
      { TRUSTED_PROXY_IP_HEADER: "none", RATE_LIMIT_ENABLED: true },
      true
    ).ready
  ).toBe(false);
});
it.each(["x-real-ip", "x-forwarded-for"] as const)(
  "accepts configured %s while requiring the operator's network check",
  (header) => {
    expect(
      deploymentPreflight(
        { TRUSTED_PROXY_IP_HEADER: header, RATE_LIMIT_ENABLED: true },
        true
      )
    ).toEqual({ ready: true, warnings: [] });
  }
);
it("cannot declare a public deployment ready with abuse protection disabled", () => {
  expect(
    deploymentPreflight(
      { TRUSTED_PROXY_IP_HEADER: "x-real-ip", RATE_LIMIT_ENABLED: false },
      true
    ).ready
  ).toBe(false);
});
