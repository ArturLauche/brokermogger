import { PageHeader } from "@/components/common/page-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CONSENT_STATEMENT, resolveConsentInvitation } from "@/lib/household/service";

import { decideConsentAction } from "./actions";

export const metadata = {
  title: "Household consent",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function HouseholdConsentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;
  const consent = await resolveConsentInvitation(token);

  return (
    <>
      <PublicHeader links={[]} />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-16"
      >
        <PageHeader
          title="Household privacy requests"
          description="An account holder asked to manage privacy requests on your behalf."
        />
        {done === "verified" ? (
          <Alert>
            <AlertTitle>You agreed</AlertTitle>
            <AlertDescription>
              The account holder may now prepare requests about you. Each outbound message
              still needs their approval. Brokermogger is not a law firm and does not
              guarantee removal.
            </AlertDescription>
          </Alert>
        ) : null}
        {done === "declined" ? (
          <Alert>
            <AlertTitle>You declined</AlertTitle>
            <AlertDescription>
              No requests will be generated for this invitation.
            </AlertDescription>
          </Alert>
        ) : null}
        {!consent ? (
          <Alert variant="destructive">
            <AlertTitle>This invitation is not valid</AlertTitle>
            <AlertDescription>
              The link may have expired or already been used.
            </AlertDescription>
          </Alert>
        ) : consent.status === "PENDING" && !done ? (
          <>
            <p className="text-sm leading-6">{CONSENT_STATEMENT}</p>
            <form action={decideConsentAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="token" value={token} />
              <Button type="submit" name="decision" value="agree">
                I agree
              </Button>
              <Button type="submit" name="decision" value="decline" variant="outline">
                I decline
              </Button>
            </form>
          </>
        ) : null}
      </main>
      <PublicFooter />
    </>
  );
}
