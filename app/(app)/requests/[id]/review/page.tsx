import Link from "next/link";
import { notFound } from "next/navigation";

import { DefinitionList } from "@/components/common/definition-list";
import { LetterPreview } from "@/components/common/letter-preview";
import { MaskedValue } from "@/components/common/masked-value";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { SubmitButton } from "@/components/common/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireActorOrRedirect } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { formatIsoDate } from "@/lib/format/datetime";
import { can } from "@/lib/permissions/policy";
import { readApprovalEnvelope } from "@/lib/requests/envelope";
import { canTransition } from "@/lib/requests/stateMachine";
import { maskEmail } from "@/lib/security/masking";

import { returnToDraftAction } from "../../actions";
import { ReviewApprovalForm } from "./review-form";

export const metadata = { title: "Review this request" };
export const dynamic = "force-dynamic";

export default async function ReviewRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const { id } = await params;
  const { error } = await searchParams;
  const request = await getOwnedRequest(actor, id).catch((caught) => {
    if (isAppError(caught) && caught.code === "NOT_FOUND") notFound();
    throw caught;
  });
  const snapshot = request.snapshots[0];
  const envelope = snapshot?.envelopeHash ? readApprovalEnvelope(snapshot) : null;
  const canApprove =
    can(actor, "request:approve", { ownerUserId: request.userId }).allowed &&
    ["AWAITING_USER_APPROVAL", "MANUAL_REVIEW_REQUIRED"].includes(request.status);
  const canEdit =
    can(actor, "request:update", { ownerUserId: request.userId }).allowed &&
    canTransition(request.status, "DRAFT", "USER") &&
    !request.outboundEmails.length &&
    !request.manualSubmissions.some((row) => row.snapshotId === snapshot?.id);
  const identifiers = Array.isArray(request.includedIdentifiers)
    ? (request.includedIdentifiers as { type?: string; masked?: string }[])
        .map((item) => item.masked ?? item.type ?? "")
        .filter(Boolean)
        .join(", ")
    : "—";

  return (
    <div className="flex w-full max-w-4xl min-w-0 flex-col gap-8">
      <PageHeader
        title="Review this request"
        description={
          canApprove
            ? "Check the destination, matching details, and exact message before approving."
            : "View the recorded message and its current status. Any new message needs a fresh draft and approval."
        }
        actions={<StatusBadge kind="request" status={request.status} />}
      />
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>This request could not be approved</AlertTitle>
          <AlertDescription>
            {error === "CONFLICT"
              ? "The message or request state changed. Reload before approving."
              : error === "CONSENT_REQUIRED" || error === "CONSENT_INVALID"
                ? "Consent is no longer valid for this profile."
                : "Check the request and try again."}{" "}
            Error code: <code>{error}</code>
          </AlertDescription>
        </Alert>
      ) : null}
      {canApprove &&
      request.manualReviewRequired &&
      request.manualReviewReasons.length ? (
        <Alert>
          <AlertTitle>Manual review required</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {request.manualReviewReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            Check these points before confirming the message.
          </AlertDescription>
        </Alert>
      ) : null}
      <section aria-labelledby="request-summary" className="space-y-4">
        <h2 id="request-summary" className="text-lg font-semibold">
          Message summary
        </h2>
        <DefinitionList
          layout="inline"
          items={[
            { term: "Profile", description: request.profile.displayName },
            { term: "Broker", description: request.broker.legalName },
            { term: "Jurisdiction", description: request.jurisdiction.name },
            {
              term: "Request type",
              description: request.requestType.toLowerCase().replaceAll("_", " "),
            },
            { term: "Data included", description: identifiers || "—" },
            {
              term: "Destination",
              description:
                envelope?.destination ??
                request.destinationValue ??
                "No verified destination",
            },
            {
              term: "Channel",
              description: (envelope?.channel ?? request.channel)
                .toLowerCase()
                .replaceAll("_", " "),
            },
            {
              term: "Reply address",
              description: envelope?.replyTo ? (
                <MaskedValue
                  maskedValue={maskEmail(envelope.replyTo)}
                  value={envelope.replyTo}
                  label="reply address"
                />
              ) : (
                "Requires a new snapshot"
              ),
            },
            {
              term: "Response date",
              description: request.deadlineAt
                ? formatIsoDate(request.deadlineAt)
                : "Set after submission or receipt is recorded",
            },
          ]}
        />
        <details>
          <summary className="w-fit cursor-pointer py-2 text-sm font-medium">
            Legal basis and review requirements
          </summary>
          <p className="max-w-prose py-3 text-sm leading-6 [overflow-wrap:anywhere]">
            {request.legalBasisText}
          </p>
        </details>
      </section>
      <section aria-labelledby="message-text" className="space-y-4">
        <h2 id="message-text" className="text-lg font-semibold">
          Exact message
        </h2>
        {snapshot ? (
          <LetterPreview
            subject={snapshot.subject}
            body={snapshot.body}
            label="Reveal the exact message (contains personal data)"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            No message has been rendered yet.
          </p>
        )}
      </section>
      {canApprove && snapshot?.envelopeHash ? (
        <section aria-labelledby="approve-title" className="space-y-4">
          <h2 id="approve-title" className="text-lg font-semibold">
            Approve this message
          </h2>
          <ReviewApprovalForm
            requestId={request.id}
            envelopeHash={snapshot.envelopeHash}
            manual={request.channel !== "EMAIL"}
          />
        </section>
      ) : (
        <p className="border-t pt-6 text-sm leading-6 text-muted-foreground">
          {canApprove
            ? "This message has no complete approval envelope. Regenerate a draft before approving."
            : "This request is not awaiting approval. Open its history to see submissions, replies, and available next actions."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {canEdit ? (
          <form action={returnToDraftAction}>
            <input type="hidden" name="requestId" value={request.id} />
            <SubmitButton variant="outline" pendingText="Opening draft…">
              Back to draft
            </SubmitButton>
          </form>
        ) : null}
        <Link
          href={`/requests/${id}`}
          className="inline-flex min-h-11 items-center text-sm underline md:min-h-10"
        >
          Return to request
        </Link>
      </div>
    </div>
  );
}
