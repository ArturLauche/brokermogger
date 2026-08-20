/**
 * Landing page hero. Owns the single `h1` of the page.
 *
 * The claims here are limited to what the software actually does: it prepares
 * requests, it shows them to you, and it sends nothing on its own.
 */
import Link from "next/link";
import { CheckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

const FACTS = [
  "Nothing leaves this instance until you have read and approved it.",
  "Every request keeps a record of what was sent, to whom and when.",
  "Free to use, open source, and you can run it on your own server.",
];

export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 md:py-24">
        <div className="flex max-w-3xl flex-col gap-5">
          <p className="text-sm font-medium text-muted-foreground">
            Open source privacy request desk
          </p>
          <h1
            id="hero-heading"
            className="font-heading text-3xl leading-tight font-semibold text-balance md:text-4xl"
          >
            Prepare, approve and track your own privacy requests
          </h1>
          <p className="text-lg text-pretty text-muted-foreground">
            Brokermogger writes the request a data broker needs, in the wording that fits
            the jurisdiction, and keeps track of the answer. You read the final text and
            decide whether it is sent.
          </p>
          <ul className="flex flex-col gap-2">
            {FACTS.map((fact) => (
              <li key={fact} className="flex items-start gap-2 text-sm">
                <CheckIcon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-success"
                />
                <span>{fact}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/login">Create an account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/#how-it-works">See how it works</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            You sign in with a one time link sent to your email address. There is no
            password to remember and no payment step.
          </p>
        </div>
      </div>
    </section>
  );
}
