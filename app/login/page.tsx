/**
 * Sign in screen.
 *
 * One email field, one server action, no password. The form posts directly to
 * the action, so the flow also works with JavaScript disabled. Validation
 * errors come back as `?error=` because a redirect is the only way to report a
 * problem without client side state.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { env } from "@/lib/config/env";

import { requestMagicLink } from "./actions";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Brokermogger with a one time link sent to your email address.",
  robots: { index: false, follow: false },
};

// The Content-Security-Policy nonce is created per request, so this page must
// never be served from the static shell.
export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "Enter an email address in the format name@example.org.",
  missing_email: "Enter the email address you want to sign in with.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.invalid_email)
    : null;
  const linkMinutes = Math.round(env.AUTH_MAGIC_LINK_TTL_SECONDS / 60);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Sign in to Brokermogger
        </h1>
        <p className="text-sm text-muted-foreground">
          We send a one time link to your email address. There is no password to remember
          and nothing to install.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email address</CardTitle>
          <CardDescription>
            The link works once and expires after about {linkMinutes} minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={requestMagicLink} className="flex flex-col gap-4" noValidate>
            <Field data-invalid={errorMessage !== null}>
              <FieldLabel htmlFor="email">Your email address</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                placeholder="name@example.org"
                aria-invalid={errorMessage !== null}
                aria-describedby={
                  errorMessage ? "email-error email-privacy" : "email-privacy"
                }
              />
              {errorMessage ? (
                <FieldError id="email-error">{errorMessage}</FieldError>
              ) : null}
              <FieldDescription id="email-privacy">
                We only use this address to sign you in and to reply about your requests.
              </FieldDescription>
            </Field>

            <Button type="submit" className="w-full">
              Send me a sign in link
            </Button>
          </form>
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
