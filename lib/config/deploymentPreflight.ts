import type { RawEnv } from "./env";

/** Configuration checks only; the operator must also verify the ingress itself. */
export function deploymentPreflight(
  config: Pick<RawEnv, "TRUSTED_PROXY_IP_HEADER" | "RATE_LIMIT_ENABLED">,
  publicMultiUser = false
): { warnings: string[]; ready: boolean } {
  const warnings: string[] = [];
  if (config.TRUSTED_PROXY_IP_HEADER === "none") {
    warnings.push(
      "All callers share ten sign-in attempts per hour. One caller can exhaust login availability for the entire instance. Configure an ingress-overwritten client-IP header before opening a public multi-user deployment; see docs/authentication-abuse-controls.md."
    );
  }
  if (!config.RATE_LIMIT_ENABLED) {
    warnings.push(
      "Authentication abuse protection is disabled. Enable RATE_LIMIT_ENABLED before opening a public deployment."
    );
  }
  return { warnings, ready: !publicMultiUser || warnings.length === 0 };
}
