/**
 * Sign in error screen.
 *
 * Auth.js redirects here with `?error=`. Each case gets an explanation in plain
 * language and a way forward. The copy never mentions whether an account
 * exists, so the page cannot be used to probe addresses.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { anonymousAuditActor, recordAudit } from "@/lib/audit/service";
import { readRequestContext } from "@/lib/auth/requestContext";
import { env } from "@/lib/config/env";
import { consumePolicy, loginErrorPerIp } from "@/lib/rateLimit";

export const metadata: Metadata = {
  title: "Sign in did not work",
  description: "Explanation of why a sign in link could not be used.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface ErrorExplanation {
  title: string;
  detail: string;
  next: string;
}

/**
 * `Verification` covers all three token cases: already used, expired, or never
 * valid. Auth.js deletes the token when a link is opened, so a second click on
 * the same link is indistinguishable from an expired one.
 */
function explain(code: string | undefined): ErrorExplanation {
  switch (code) {
    case "Verification":
      return {
        title: "This sign in link no longer works",
        detail:
          "A link can only be opened once, and it expires after a short time. If you opened it twice, or if the link sat in your inbox for too long, it stops working.",
        next: "Request a new link and open it on the device you want to use.",
      };
    case "AccessDenied":
      return {
        title: "This account cannot be used to sign in",
        detail:
          "The account is suspended or scheduled for deletion, so no new session can be created for it.",
        next: `If you think this is a mistake, contact the operator of this instance at ${env.SECURITY_CONTACT_EMAIL}.`,
      };
    case "Configuration":
      return {
        title: "This instance is not configured correctly",
        detail:
          "Signing in failed before the link was checked. This is a server side configuration problem, not a problem with your address.",
        next: "The operator of this instance needs to check the server logs and the email configuration.",
      };
    default:
      return {
        title: "Signing in did not work",
        detail:
          "Something went wrong while checking the sign in link. The incident was written to the instance log.",
        next: "Request a new link. If it keeps failing, contact the operator of this instance.",
      };
  }
}

/**
 * Counts a failed sign in attempt per network. Repeated invalid tokens all land
 * on this page, so this is the cheapest place to slow down guessing. Returns
 * true when the network is over the limit.
 */
async function countFailedAttempt(code: string | undefined): Promise<boolean> {
  const context = await readRequestContext();
  const decision = await consumePolicy(
    loginErrorPerIp,
    context.ipHash ?? "unknown-network"
  );

  if (decision.allowed) {
    return false;
  }

  await recordAudit({
    actor: anonymousAuditActor(context.requestId, {
      ipHash: context.ipHash,
      userAgentHash: context.userAgentHash,
    }),
    action: "system.rate_limit_hit",
    resourceType: "instance",
    outcome: "DENIED",
    reason: "Too many failed sign in attempts from one network.",
    metadata: {
      policy: loginErrorPerIp.name,
      authErrorCode: code ?? "unknown",
      retryAfterSeconds: decision.retryAfterSeconds,
    },
  });

  return true;
}

export default async function LoginErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const explanation = explain(error);
  const throttled = await countFailedAttempt(error);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {explanation.title}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>What happened</CardTitle>
          <CardDescription>{explanation.detail}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert>
            <AlertTitle>What you can do</AlertTitle>
            <AlertDescription>{explanation.next}</AlertDescription>
          </Alert>

          {throttled ? (
            <Alert variant="destructive">
              <AlertTitle>Too many failed attempts from this network</AlertTitle>
              <AlertDescription>
                Requesting another link will not work right now. Please wait about an hour
                before you try again.
              </AlertDescription>
            </Alert>
          ) : null}

          <Button asChild className="w-full">
            <Link href="/login">Request a new link</Link>
          </Button>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        <Link href="/" className="underline underline-offset-4">
          Back to the start page
        </Link>
      </p>
    </main>
  );
}
