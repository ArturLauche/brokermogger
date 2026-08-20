/**
 * Closing call to action. Both buttons lead to the same sign in screen: the
 * one time link works for a new account and for an existing one.
 */
import Link from "next/link";

import { Section } from "@/components/marketing/section";
import { Button } from "@/components/ui/button";

export function ClosingCta() {
  return (
    <Section
      id="get-started"
      title="Start with one request"
      description="Create an account, describe one profile and prepare a single request. You can look at everything the product would send before you approve it, and you can stop at any point."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <Link href="/login">Create an account</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    </Section>
  );
}
