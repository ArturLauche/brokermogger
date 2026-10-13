import { expect, it } from "vitest";
import { deploymentPreflight } from "@/lib/config/deploymentPreflight";

it("fails by default when callers share a login bucket", () => {
  const result = deploymentPreflight({
    TRUSTED_PROXY_IP_HEADER: "none",
    RATE_LIMIT_ENABLED: true,
  });
  expect(result.ready).toBe(false);
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
it("allows explicitly private use while warning about the shared allowance", () => {
  const result = deploymentPreflight(
    { TRUSTED_PROXY_IP_HEADER: "none", RATE_LIMIT_ENABLED: true },
    false
  );
  expect(result.ready).toBe(true);
  expect(result.warnings.join(" ")).toContain("entire instance");
});
it("accepts x-real-ip configuration subject to the operator's network check", () => {
  expect(
    deploymentPreflight({
      TRUSTED_PROXY_IP_HEADER: "x-real-ip",
      RATE_LIMIT_ENABLED: true,
    })
  ).toEqual({ ready: true, warnings: [] });
});
it("warns about appended chains without prohibiting an overwritten single-address header", () => {
  const result = deploymentPreflight({
    TRUSTED_PROXY_IP_HEADER: "x-forwarded-for",
    RATE_LIMIT_ENABLED: true,
  });
  expect(result.ready).toBe(true);
  expect(result.warnings.join(" ")).toMatch(/append.*shared/);
});
it("cannot declare a public deployment ready with abuse protection disabled", () => {
  expect(
    deploymentPreflight(
      { TRUSTED_PROXY_IP_HEADER: "x-real-ip", RATE_LIMIT_ENABLED: false },
      true
    ).ready
  ).toBe(false);
});
