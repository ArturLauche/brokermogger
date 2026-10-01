import { PageHeader } from "@/components/common/page-header";
import { InstancePublicFooter } from "@/components/layout/instance-public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { resolveConsentInvitation } from "@/lib/household/service";
import { COUNTRY_NAMES } from "@/lib/jurisdiction/types";
import { US_STATES } from "@/lib/jurisdiction/locations";
import { ConsentForm } from "./consent-form";
export const metadata = {
  title: "Household consent",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function HouseholdConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const consent = await resolveConsentInvitation(token);
  const messages = {
    VERIFIED: [
      "Permission granted",
      "The account holder may prepare requests about you. Each outbound message still needs their approval. You can withdraw permission below at any time. Messages already accepted by a provider cannot be recalled.",
    ],
    DECLINED: [
      "Invitation declined",
      "This invitation does not authorize any requests. The account holder would need to invite you again if you change your mind.",
    ],
    EXPIRED: [
      "Invitation expired",
      "The seven-day invitation window has ended. Ask the account holder for a new invitation.",
    ],
    REVOKED: [
      "Permission withdrawn",
      "This link no longer authorizes requests or queued sends. A new invitation is required to grant permission again.",
    ],
  } as const;
  const info = consent && consent.status !== "PENDING" ? messages[consent.status] : null;
  return (
    <>
      <PublicHeader links={[]} />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12"
      >
        <PageHeader
          title="Household privacy requests"
          description="An account holder asked to manage privacy requests on your behalf."
        />
        {!consent ? (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Invitation unavailable</h2>
            <p>
              This invitation does not exist or its account is no longer active. Ask the
              account holder for a new link.
            </p>
          </section>
        ) : (
          <>
            {info && (
              <section className="space-y-2" role="status">
                <h2 className="text-lg font-semibold">{info[0]}</h2>
                <p className="leading-7">{info[1]}</p>
              </section>
            )}
            {consent.status === "PENDING" && (
              <>
                <dl className="space-y-3 border-y py-4">
                  <div>
                    <dt className="text-sm text-muted-foreground">Invited email</dt>
                    <dd>{consent.contactEmailMasked}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Residence</dt>
                    <dd>
                      {COUNTRY_NAMES[consent.countryCode] ?? consent.countryCode}
                      {consent.region
                        ? ` · ${consent.countryCode === "US" ? (US_STATES[consent.region as keyof typeof US_STATES] ?? consent.region) : consent.region}`
                        : ""}
                    </dd>
                  </div>
                </dl>
                <p className="leading-7">{consent.statementText}</p>
                <ConsentForm token={token} />
              </>
            )}
            {consent.status === "VERIFIED" && <ConsentForm token={token} withdraw />}
          </>
        )}
      </main>
      <InstancePublicFooter />
    </>
  );
}
