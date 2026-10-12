import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ExternalLink } from "@/components/common/external-link";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { requireActorOrRedirect } from "@/lib/auth";
import { brokerRequirements } from "@/lib/brokers/requirements";
import { getBrokerWithContacts } from "@/lib/db/repositories/catalog";
import { formatIsoDate } from "@/lib/format/datetime";
import { REQUEST_TYPE_LABELS } from "@/lib/requests/labels";
import { entityIdSchema } from "@/lib/validation/ids";
import { BrokerReadinessSummary } from "@/components/brokers/readiness-summary";
import { BROKER_REVIEW_INTERVAL_DAYS, reviewAge } from "@/lib/catalogue/reviewAge";

export const metadata = { title: "Broker instructions" };
export const dynamic = "force-dynamic";
export default async function BrokerInstructionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireActorOrRedirect();
  const input = entityIdSchema.safeParse((await params).id);
  if (!input.success) notFound();
  const broker = await getBrokerWithContacts(input.data);
  if (!broker) notFound();
  const requirements = brokerRequirements(broker.verificationRequirements);
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-8">
      <Link href="/brokers" className="text-sm underline">
        Broker directory
      </Link>
      <PageHeader
        title={broker.legalName}
        description={
          broker.tradingNames.join(" · ") ||
          "Sourced contact methods and request instructions."
        }
      />
      <div className="space-y-3 text-sm">
        <StatusBadge kind="brokerVerification" status={broker.verificationStatus} />
        <p>
          {broker.isDemoData
            ? "Fictional demo entry. It cannot be used for real broker sending."
            : "Operator-maintained entry. Verify the current official instructions before sharing information."}
        </p>
        <p>
          {broker.isActive ? "Active" : "Inactive"} · Broker sending{" "}
          {broker.productionSendingEnabled ? "enabled" : "disabled"} · Last reviewed{" "}
          {formatIsoDate(broker.lastVerifiedAt)}
        </p>
        {broker.sourceUrl ? (
          <ExternalLink href={broker.sourceUrl}>Read the primary source</ExternalLink>
        ) : (
          <p>No primary source recorded.</p>
        )}
      </div>
      <BrokerReadinessSummary readiness={broker.readiness} />
      <section className="space-y-4 border-t pt-6" aria-labelledby="broker-instructions">
        <h2 id="broker-instructions" className="text-xl font-semibold">
          Instructions and limitations
        </h2>
        <p className="text-sm leading-6 whitespace-pre-wrap">
          {broker.notes || "No additional operator instructions recorded."}
        </p>
        {requirements.notes ? (
          <p className="text-sm leading-6 whitespace-pre-wrap">{requirements.notes}</p>
        ) : null}
        {requirements.accountRequired ? (
          <p className="text-sm">
            The source records a broker-account requirement. Complete any login yourself.
          </p>
        ) : null}
        {requirements.notarised ? (
          <p className="text-sm">
            The source mentions notarisation. Check whether it applies to your specific
            request.
          </p>
        ) : null}
        {requirements.identityDocument ? (
          <p className="text-sm">
            The source mentions identity documents. Do not provide one by default. Confirm
            that the broker actually requested verification, consider less intrusive
            alternatives and decide yourself what to submit.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Brokermogger does not scrape sites or bypass logins, CAPTCHAs or broker
          restrictions. A suppression choice can have a different effect from deletion of
          an account or all records.
        </p>
      </section>
      <section className="space-y-5 border-t pt-6" aria-labelledby="broker-methods">
        <h2 id="broker-methods" className="text-xl font-semibold">
          Active methods
        </h2>
        {!broker.contactMethods.length ? (
          <p className="text-sm">
            No active methods are recorded. Ask the instance maintainer to review the
            entry.
          </p>
        ) : null}
        {broker.contactMethods.map((method) => (
          <div key={method.id} className="space-y-2 border-t pt-4 text-sm">
            <h3 className="font-semibold">
              {method.label || method.type.toLowerCase().replaceAll("_", " ")}
            </h3>
            <p>
              {method.isVerified
                ? `Verification recorded ${formatIsoDate(method.verifiedAt)} · ${reviewAge(method.verifiedAt, BROKER_REVIEW_INTERVAL_DAYS).label}`
                : "Not verified"}
            </p>
            {method.type === "EMAIL" || method.type === "POSTAL" ? (
              <p className="break-words whitespace-pre-wrap">{method.value}</p>
            ) : (
              <ExternalLink href={method.value}>Open the published method</ExternalLink>
            )}
            {method.sourceUrl ? (
              <ExternalLink href={method.sourceUrl}>
                Method verification source
              </ExternalLink>
            ) : null}
          </div>
        ))}
      </section>
      <section className="space-y-4 border-t pt-6" aria-labelledby="broker-coverage">
        <h2 id="broker-coverage" className="text-xl font-semibold">
          Recorded coverage
        </h2>
        {!broker.jurisdictionCoverage.length ? (
          <p className="text-sm">
            No jurisdiction coverage is confirmed. Preparing a draft does not establish
            that a legal right applies to this broker.
          </p>
        ) : null}
        {broker.jurisdictionCoverage.map((row) => (
          <div key={row.id} className="space-y-2 text-sm">
            <h3 className="font-semibold">{row.jurisdiction.name}</h3>
            <p>
              {row.coverageType.toLowerCase().replaceAll("_", " ")} · Confidence:{" "}
              {row.confidence.toLowerCase()}
            </p>
            <p>
              {row.supportedRequestTypes.length
                ? row.supportedRequestTypes
                    .map((type) => REQUEST_TYPE_LABELS[type])
                    .join(" · ")
                : "Supported request types have not been confirmed."}
            </p>
            {row.notes ? (
              <p className="leading-6 whitespace-pre-wrap">{row.notes}</p>
            ) : null}
          </div>
        ))}
      </section>
      {broker.isActive ? (
        <Button asChild className="self-start">
          <Link href={`/requests/new?brokers=${broker.id}`}>Prepare a request</Link>
        </Button>
      ) : (
        <p className="text-sm">New requests are disabled for this inactive entry.</p>
      )}
    </div>
  );
}
