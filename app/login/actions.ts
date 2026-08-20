"use server";

/**
 * Sign in server action.
 *
 * Three properties matter here:
 *
 *  1. No account enumeration. Whatever happens, the action redirects to
 *     `/login/check-email`. A known address, an unknown address and a rate
 *     limited address are indistinguishable from the outside.
 *  2. Rate limits are consumed before Auth.js is called, so a rejected request
 *     never sends an email. The magic link module enforces the same limit again
 *     for the raw Auth.js endpoint.
 *  3. It works without JavaScript. The form posts to this action, validation
 *     errors come back as a query parameter on `/login`.
 */
import { redirect } from "next/navigation";
import { z } from "zod";

import { anonymousAuditActor, recordAudit } from "@/lib/audit/service";
import { signIn } from "@/lib/auth";
import { withMagicLinkContext } from "@/lib/auth/magicLinkContext";
import { emailIndexFor, readRequestContext } from "@/lib/auth/requestContext";
import { createLogger } from "@/lib/observability/logger";
import { consumePolicy, magicLinkPerEmail, magicLinkPerIp } from "@/lib/rateLimit";
import { emailDomain } from "@/lib/security/sanitize";

const log = createLogger("auth.login-action");

const CHECK_EMAIL_PATH = "/login/check-email";

const requestSchema = z.object({
  email: z.email().max(254),
});

/**
 * The rate limit key for the network. Derived from the hashed request context so
 * that no raw IP address is used, and falls back to a shared bucket when the
 * deployment does not forward a client address.
 */
function networkKey(ipHash: string | null): string {
  return ipHash ?? "unknown-network";
}

export async function requestMagicLink(formData: FormData): Promise<void> {
  const parsed = requestSchema.safeParse({
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
  });

  if (!parsed.success) {
    redirect("/login?error=invalid_email");
  }

  const email = parsed.data.email;
  const context = await readRequestContext();
  const actor = anonymousAuditActor(context.requestId, {
    ipHash: context.ipHash,
    userAgentHash: context.userAgentHash,
    emailIndex: emailIndexFor(email),
  });

  const [byEmail, byNetwork] = await Promise.all([
    consumePolicy(magicLinkPerEmail, email),
    consumePolicy(magicLinkPerIp, networkKey(context.ipHash)),
  ]);

  if (!byEmail.allowed || !byNetwork.allowed) {
    await recordAudit({
      actor,
      action: "auth.magic_link.rate_limited",
      resourceType: "user",
      outcome: "DENIED",
      reason: "The fair use limit for sign in links was reached.",
      metadata: {
        entryPoint: "login_form",
        emailLimitReached: !byEmail.allowed,
        networkLimitReached: !byNetwork.allowed,
        retryAfterSeconds: Math.max(
          byEmail.retryAfterSeconds,
          byNetwork.retryAfterSeconds
        ),
        recipientDomain: emailDomain(email),
      },
    });

    // Same destination as a successful request: the response must not reveal
    // that this address was throttled.
    redirect(CHECK_EMAIL_PATH);
  }

  await recordAudit({
    actor,
    action: "auth.magic_link.requested",
    resourceType: "user",
    metadata: {
      entryPoint: "login_form",
      emailIndex: emailIndexFor(email),
      remainingForAddress: byEmail.remaining,
    },
  });

  try {
    await withMagicLinkContext(
      {
        rateLimitConsumed: true,
        requestId: context.requestId,
        ipHash: context.ipHash,
        userAgentHash: context.userAgentHash,
      },
      async () => {
        await signIn("magic-link", {
          email,
          redirect: false,
          redirectTo: "/dashboard",
        });
      }
    );
  } catch (error) {
    // Never surface the reason: a failure for an unknown address and a failure
    // for a known address must look identical.
    log.error({ err: error }, "Could not start the magic link flow");
  }

  redirect(CHECK_EMAIL_PATH);
}
