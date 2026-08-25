"use client";

import Link from "next/link";

import { ErrorState } from "@/components/common/error-state";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { Button } from "@/components/ui/button";

/**
 * Route level error boundary.
 *
 * The message of the caught error is deliberately not rendered: it can contain
 * internal detail. The digest is the identifier that ties this screen to the
 * server log entry, so it is shown as the error code.
 */
export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <meta name="robots" content="noindex, nofollow" />
      <PublicHeader links={[]} />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-16 focus:outline-none"
      >
        <ErrorState
          className="w-full"
          title="Something went wrong"
          description="This screen could not be loaded. Nothing was sent to a broker because of this error. You can try again, and if the problem stays, pass the error code to the operator of this instance."
          errorCode={error.digest ?? "UNKNOWN"}
          onRetry={reset}
          action={
            <Button asChild variant="outline">
              <Link href="/">Go to the start page</Link>
            </Button>
          }
        />
      </main>
      <PublicFooter />
    </>
  );
}
