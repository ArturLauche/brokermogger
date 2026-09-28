import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { DefinitionList } from "@/components/common/definition-list";
import { ExternalLink } from "@/components/common/external-link";
import { Button } from "@/components/ui/button";
import { requireActorOrRedirect } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { getEscalationSummary } from "@/lib/db/repositories/requestEscalation";
import { formatIsoDate } from "@/lib/format/datetime";
import { REQUEST_TYPE_LABELS } from "@/lib/requests/labels";
import { RESPONSE_LABELS } from "@/lib/responses/labels";

export const metadata = { title: "Escalation preparation" };
export const dynamic = "force-dynamic";

export default async function EscalationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const { id } = await params;
  let summary;
  try {
    summary = await getEscalationSummary(actor, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (!isAppError(error)) throw error;
    return (
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
        <PageHeader title="Escalation preparation" description={error.message} />
        <Link className="underline" href={`/requests/${encodeURIComponent(id)}`}>
          Return to request
        </Link>
      </div>
    );
  }
  const rule = summary.rule;
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-8">
      <PageHeader
        title="Prepare your next step"
        description={`${summary.brokerName} · ${REQUEST_TYPE_LABELS[summary.requestType]}`}
      />
      <p className="text-sm leading-6">
        This summary helps you gather the facts for your own review. Brokermogger has not
        filed a complaint or contacted an authority. Check the applicable process before
        deciding whether to submit anything.
      </p>
      <section className="space-y-4" aria-labelledby="escalation-record">
        <h2 id="escalation-record" className="text-lg font-semibold">
          Recorded information
        </h2>
        <DefinitionList
          items={[
            { term: "Reference", description: summary.reference ?? summary.requestId },
            {
              term: "Manual submissions",
              description: String(summary.manualSubmissionCount),
            },
            {
              term: "First manual submission",
              description: formatIsoDate(summary.firstManualSubmission),
            },
            {
              term: "Recorded receipt",
              description: formatIsoDate(summary.recordedReceipt),
            },
            {
              term: "Emails accepted by a real provider",
              description: String(summary.realAcceptedEmails),
            },
            {
              term: "Simulated or sandbox emails",
              description: String(summary.simulatedEmails),
            },
            {
              term: "Recorded response date",
              description: formatIsoDate(summary.deadlineAt),
            },
            {
              term: "Available records",
              description: `${summary.snapshotCount} message snapshots · ${summary.evidenceCount} evidence files`,
            },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          Provider acceptance does not prove receipt. Simulated and sandbox messages did
          not contact the broker. A response date may be an estimate; verify the
          applicable rule and receipt date before treating it as a deadline.
        </p>
        {summary.replies.length ? (
          <ul className="list-inside list-disc space-y-1 text-sm">
            {summary.replies.map((reply) => (
              <li key={reply.classification}>
                {RESPONSE_LABELS[reply.classification]}: {reply.count}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No reply classifications have been confirmed.
          </p>
        )}
      </section>
      <section className="space-y-3 border-t pt-6" aria-labelledby="escalation-source">
        <h2 id="escalation-source" className="text-lg font-semibold">
          Authority and source
        </h2>
        <p className="text-sm">
          {rule?.escalationAuthority ?? "No authority is listed in the applied rule."}
        </p>
        <p className="text-sm leading-6">
          {rule?.escalationPath ??
            "Check the relevant privacy authority’s guidance for your location and the broker’s activities."}
        </p>
        <p className="text-sm text-muted-foreground">
          The correct authority depends on location, subject matter and the broker. The
          listed route is guidance, not a decision that your complaint is eligible.
        </p>
        {rule ? (
          <>
            <p className="text-sm">
              Rule version {rule.version} · Reviewed {formatIsoDate(rule.lastReviewedAt)}{" "}
              · Confidence: {rule.confidence.toLowerCase()}
              {rule.requiresLegalReview ? " · Requires legal review" : ""}
            </p>
            <div className="flex flex-col items-start gap-3 text-sm">
              <ExternalLink href={rule.sourceUrl}>{rule.sourceTitle}</ExternalLink>
              {rule.escalationUrl ? (
                <ExternalLink href={rule.escalationUrl}>
                  Read the authority’s submission guidance
                </ExternalLink>
              ) : null}
            </div>
          </>
        ) : null}
      </section>
      <section className="space-y-4 border-t pt-6" aria-labelledby="escalation-checklist">
        <h2 id="escalation-checklist" className="text-lg font-semibold">
          Prepare the material yourself
        </h2>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
          <li>
            Read the authority’s requirements. Complete any required broker appeal first
            and check the permitted time limits.
          </li>
          <li>
            Write what remains unresolved and the outcome you seek. Distinguish recorded
            facts from disputed points.
          </li>
          <li>
            Gather approved letters, submission or receipt proof, relevant replies and
            selected evidence. The download below contains a summary, without message
            contents or personal identifiers.
          </li>
          <li>
            Remove unnecessary personal information. If acting for another adult, confirm
            their current permission for any external submission.
          </li>
          <li>
            If you decide to proceed, use the authority’s own process. Keep its
            acknowledgement and add it as evidence here if useful.
          </li>
        </ol>
      </section>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <a href={`/api/requests/${encodeURIComponent(id)}/escalation`}>
            Download preparation summary
          </a>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/requests/${encodeURIComponent(id)}`}>Return to request</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/evidence?requestId=${encodeURIComponent(id)}`}>
            Add supporting evidence
          </Link>
        </Button>
      </div>
    </div>
  );
}
