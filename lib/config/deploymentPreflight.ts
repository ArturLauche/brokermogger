import type { RawEnv } from "./env";

/** Configuration checks only; the operator must also verify the ingress itself. */
export function deploymentPreflight(
  config: Pick<RawEnv, "TRUSTED_PROXY_IP_HEADER" | "RATE_LIMIT_ENABLED">,
  publicMultiUser = true
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
  if (config.TRUSTED_PROXY_IP_HEADER === "x-forwarded-for") {
    warnings.push(
      "An appending x-forwarded-for proxy collapses callers into the shared network bucket. Overwrite it with one numeric client address; prefer x-real-ip. Check brokermogger_auth_unknown_network_attempts_24h for unattributed admission attempts."
    );
  }
  return {
    warnings,
    ready:
      !publicMultiUser ||
      (config.TRUSTED_PROXY_IP_HEADER !== "none" && config.RATE_LIMIT_ENABLED),
  };
}
