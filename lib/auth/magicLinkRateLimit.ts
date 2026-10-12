/** Shared pre-issuance gate for form and direct Auth.js requests. */
import { anonymousAuditActor, recordAudit } from "@/lib/audit/service";
import { consumePolicies, magicLinkPerEmail, magicLinkPerIp } from "@/lib/rateLimit";
import { assertValidEmailAddress } from "@/lib/security/sanitize";
import { currentMagicLinkContext, oncePerMagicLinkRequest } from "./magicLinkContext";
import { emailIndexFor, readRequestContext } from "./requestContext";

// Match Auth.js's successful first-leg redirect exactly, including its query.
export const MAGIC_LINK_VERIFY_PATH =
  "/api/auth/verify-request?provider=magic-link&type=email";

export async function authorizeMagicLinkRequest(identifier: string): Promise<boolean> {
  const address = assertValidEmailAddress(identifier, "email");
  const emailIndex = emailIndexFor(address);
  return oncePerMagicLinkRequest(emailIndex!, async () => {
    const context = await readRequestContext();
    const [byEmail, byNetwork] = await consumePolicies([
      { policy: magicLinkPerEmail, key: address },
      { policy: magicLinkPerIp, key: context.ipHash ?? "unknown-network" },
    ]);
    const allowed = byEmail!.allowed && byNetwork!.allowed;
    await recordAudit({
      actor: anonymousAuditActor(context.requestId, {
        ipHash: context.ipHash,
        userAgentHash: context.userAgentHash,
        emailIndex,
      }),
      action: allowed ? "auth.magic_link.requested" : "auth.magic_link.rate_limited",
      resourceType: "user",
      ...(allowed
        ? {}
        : {
            outcome: "DENIED" as const,
            reason: "The operational limit for sign in links was reached.",
          }),
      metadata: {
        entryPoint: currentMagicLinkContext()?.entryPoint ?? "auth_api",
        emailLimitReached: !byEmail!.allowed,
        networkLimitReached: !byNetwork!.allowed,
        retryAfterSeconds: Math.max(
          byEmail!.retryAfterSeconds,
          byNetwork!.retryAfterSeconds
        ),
      },
    });
    return allowed;
  });
}
