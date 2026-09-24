import { notFound } from "next/navigation";

import { DefinitionList } from "@/components/common/definition-list";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActorOrRedirect } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { formatIsoDate } from "@/lib/format/datetime";
import { APPROVAL_CHECKBOX_LABEL } from "@/lib/requests/labels";
import { readApprovalEnvelope } from "@/lib/requests/envelope";

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

  let request;
  try {
    request = await getOwnedRequest(actor, id);
  } catch (caught) {
    if (isAppError(caught) && caught.code === "NOT_FOUND") {
      notFound();
    }
    throw caught;
  }

  const snapshot = request.snapshots[0];
  const envelope = snapshot?.envelopeHash ? readApprovalEnvelope(snapshot) : null;
  const identifiers = Array.isArray(request.includedIdentifiers)
    ? (request.includedIdentifiers as { type?: string; masked?: string }[])
        .map((item) => item.masked ?? item.type ?? "")
        .filter(Boolean)
        .join(", ")
    : "—";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Review this request"
        description="Read the exact outbound text. Nothing is sent until you approve it."
      />
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>This request could not be approved</AlertTitle>
          <AlertDescription>
            {error === "CONFLICT"
              ? "This text changed. Reload before approving."
              : error === "CONSENT_REQUIRED" || error === "CONSENT_INVALID"
                ? "Consent is no longer valid for this profile."
                : "Check the request and try again."}{" "}
            Error code: <code>{error}</code>
          </AlertDescription>
        </Alert>
      ) : null}
      {request.manualReviewRequired && request.manualReviewReasons.length > 0 ? (
        <Alert>
          <AlertTitle>Manual review required</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {request.manualReviewReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            The same confirmation still applies for this self-service review.
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
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
              { term: "Legal basis", description: request.legalBasisText },
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
                description: envelope?.replyTo ?? "Requires a new snapshot",
              },
              { term: "Deadline", description: formatIsoDate(request.deadlineAt) },
              {
                term: "Manual review required",
                description: request.manualReviewRequired ? "Yes" : "No",
              },
              {
                term: "Final request text",
                description: snapshot ? (
                  <pre className="rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                    {`Subject: ${snapshot.subject}\n\n${snapshot.body}`}
                  </pre>
                ) : (
                  "No snapshot"
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
      <p className="sr-only">{APPROVAL_CHECKBOX_LABEL}</p>
      {snapshot?.envelopeHash ? (
        <ReviewApprovalForm
          requestId={request.id}
          envelopeHash={snapshot.envelopeHash}
          manual={request.channel !== "EMAIL"}
        />
      ) : (
        <Alert variant="destructive">
          <AlertTitle>No rendered text</AlertTitle>
          <AlertDescription>This request has no snapshot to approve.</AlertDescription>
        </Alert>
      )}
      <form action={returnToDraftAction}>
        <input type="hidden" name="requestId" value={request.id} />
        <Button type="submit" variant="outline">
          Back to draft
        </Button>
      </form>
      <StatusBadge kind="request" status={request.status} />
    </div>
  );
}
