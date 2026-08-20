/**
 * Confirmation screen after a sign in link was requested.
 *
 * The wording is deliberately conditional ("if the address belongs to an
 * account"). This page is shown for a known address, an unknown address and a
 * throttled address alike, so it must never confirm that an account exists.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { env } from "@/lib/config/env";

export const metadata: Metadata = {
  title: "Check your email",
  description: "A one time sign in link was sent if the address belongs to an account.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function CheckEmailPage() {
  const linkMinutes = Math.round(env.AUTH_MAGIC_LINK_TTL_SECONDS / 60);
  const isDevelopment = env.APP_ENV === "development";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Check your email
        </h1>
        <p className="text-sm text-muted-foreground">
          If the address you entered belongs to an account, a sign in link is on its way.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What happens now</CardTitle>
          <CardDescription>
            Open the link on this device to finish signing in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              The link can be used once and expires after about {linkMinutes} minutes.
            </li>
            <li>
              We never confirm whether an address has an account, so this page looks the
              same for every address.
            </li>
            <li>
              Nothing is sent to a data broker at this point. Signing in only opens your
              own account.
            </li>
          </ul>
        </CardContent>
      </Card>

      {isDevelopment ? (
        <Alert>
          <AlertTitle>Development instance</AlertTitle>
          <AlertDescription>
            No real email is sent. The mock provider writes every message to the
            <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {env.MOCK_EMAIL_DIR}
            </code>
            directory. Open the newest file there and use the link inside.
          </AlertDescription>
        </Alert>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Wrong address or no email after a few minutes?{" "}
        <Link href="/login" className="underline underline-offset-4">
          Try another address
        </Link>
        .
      </p>
    </main>
  );
}
