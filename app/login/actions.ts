"use server";

/**
 * Sign in server action.
 *
 * Three properties matter here:
 *
 *  1. No account enumeration. Whatever happens, the action redirects to
 *     `/login/check-email`. A known address, an unknown address and a rate
 *     limited address are indistinguishable from the outside.
 *  2. The shared Auth.js gate consumes both quotas before issuing a token or
 *     sending an email, using request-local context to avoid double counting.
 *  3. It works without JavaScript. The form posts to this action, validation
 *     errors come back as a query parameter on `/login`.
 */
import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn } from "@/lib/auth";
import { withMagicLinkContext } from "@/lib/auth/magicLinkContext";
import { readRequestContext } from "@/lib/auth/requestContext";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("auth.login-action");

const CHECK_EMAIL_PATH = "/login/check-email";

const requestSchema = z.object({
  email: z.email().max(254),
});

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
  try {
    await withMagicLinkContext(
      {
        entryPoint: "login_form",
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
