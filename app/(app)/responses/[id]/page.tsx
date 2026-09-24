import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActorOrRedirect } from "@/lib/auth";
import {
  getOwnedResponse,
  searchResponseRequestChoices,
} from "@/lib/db/repositories/responses";
import { isAppError } from "@/lib/core/errors";
import { getDateFormatter } from "@/app/_lib/datetime";
import { formatIsoDate } from "@/lib/format/datetime";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmSubmitButton } from "@/components/common/confirm-submit-button";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RESPONSE_LABELS } from "@/lib/responses/labels";
import { ConfirmResponseForm, LinkResponseForm } from "../response-forms";
import { deleteResponseAction } from "../actions";

export const metadata = { title: "Review correspondence" };
export const dynamic = "force-dynamic";

export default async function ResponsePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; q?: string; cursor?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const { id } = await params;
  let response;
  try {
    response = await getOwnedResponse(actor, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const query = await searchParams;
  const choices = !response.removalRequestId
    ? await searchResponseRequestChoices(actor, {
        q: query.q ?? "",
        cursor: query.cursor,
      })
    : null;
  const { formatStamp } = await getDateFormatter();
  const request = response.removalRequest;
  const hasContent = Boolean(
    (response.content.body && !response.content.previewOnly) || response.evidenceFileId
  );
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Review correspondence"
        description={
          response.broker?.legalName ?? "This reply has not been matched to a request."
        }
        actions={
          request ? (
            <Button asChild variant="outline">
              <Link href={`/requests/${request.id}`}>Open request</Link>
            </Button>
          ) : null
        }
      />
      {["recorded", "confirmed", "matched"].includes(query.saved ?? "") ? (
        <p role="status" className="text-sm">
          {query.saved === "recorded"
            ? "Reply saved. Review its content and confirm its meaning below."
            : "Your review has been saved."}
        </p>
      ) : null}
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Received</dt>
          <dd>
            {response.receivedOn
              ? `${formatIsoDate(response.receivedOn)} (date recorded by you)`
              : formatStamp(response.receivedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Classification</dt>
          <dd>
            {response.confirmedAt
              ? RESPONSE_LABELS[response.classification]
              : "Awaiting your confirmation"}
          </dd>
        </div>
        {request ? (
          <div>
            <dt className="text-muted-foreground">Request status</dt>
            <dd>
              <StatusBadge kind="request" status={request.status} />
            </dd>
          </div>
        ) : null}
      </dl>
      <section aria-labelledby="reply-content" className="space-y-3">
        <h2 id="reply-content" className="text-xl font-semibold">
          Reply content
        </h2>
        <p className="text-sm text-muted-foreground">
          Messages are displayed as text. HTML, remote images and tracking pixels do not
          run. Verify sender details and any instructions independently.
        </p>
        <details className="border-y py-4">
          <summary className="cursor-pointer text-sm font-medium">
            Reveal reply (may contain personal data)
          </summary>
          <div className="mt-4 space-y-4">
            <p className="text-sm break-words">
              From: {response.content.fromAddress || "Not recorded"}
            </p>
            <h3 className="text-base font-semibold break-words">
              {response.content.subject || "Subject not recorded"}
            </h3>
            {response.content.body ? (
              <pre className="font-sans text-base leading-7 break-words whitespace-pre-wrap">
                {response.content.body}
              </pre>
            ) : (
              <p className="text-sm">
                The reply has no imported text. Review the attached evidence, or record
                the full reply manually from its request.
              </p>
            )}
          </div>
        </details>
        {response.evidenceFileId ? (
          <a
            className="text-sm underline"
            href={`/api/evidence/${response.evidenceFileId}/download`}
          >
            Download attached evidence
          </a>
        ) : null}
        {!hasContent ? (
          <p role="status" className="text-sm text-muted-foreground">
            Content could not be imported or the message only contains attachments.
            Attachments are not downloaded automatically. Retrieve the original through
            the provider or your mailbox and record the relevant text or evidence.
          </p>
        ) : null}
        {request ? (
          <Link
            className="text-sm underline"
            href={`/requests/${request.id}/responses/new`}
          >
            Record additional reply text or evidence
          </Link>
        ) : null}
      </section>
      {choices ? (
        <section className="space-y-4 border-t pt-6" aria-labelledby="match-reply">
          <h2 id="match-reply" className="text-xl font-semibold">
            Choose the matching request
          </h2>
          <p className="text-sm text-muted-foreground">
            The private address identifies your account. A missing, short or ambiguous
            request reference does not select a request automatically.
          </p>
          <form className="flex items-end gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="q">Search your requests</Label>
              <Input
                id="q"
                name="q"
                maxLength={160}
                defaultValue={query.q}
                placeholder="Broker name or full request reference"
              />
            </div>
            <Button variant="outline">Search</Button>
          </form>
          <LinkResponseForm
            initial={{
              responseId: id,
              expectedRevision: String(response.classificationRevision),
              requestId: "",
            }}
            requests={choices.items.map((row) => ({
              id: row.id,
              label: `${row.broker.legalName} · ${row.profile.displayName} · ${row.externalReference ?? row.id}`,
            }))}
          />
          {choices.nextCursor ? (
            <Link
              className="text-sm underline"
              href={`/responses/${id}?${new URLSearchParams({ q: query.q ?? "", cursor: choices.nextCursor })}`}
            >
              Next 25 requests
            </Link>
          ) : null}
          {query.cursor ? (
            <Link
              className="ml-4 text-sm underline"
              href={`/responses/${id}?${new URLSearchParams({ q: query.q ?? "" })}`}
            >
              First page
            </Link>
          ) : null}
        </section>
      ) : null}
      {response.content.previewOnly ? (
        <p role="status" className="text-sm">
          Only a preview survived from the previous version. Review the original reply and
          record its full text or evidence before applying an outcome.
        </p>
      ) : null}
      <section aria-labelledby="confirm-reply" className="space-y-4 border-t pt-6">
        <h2 id="confirm-reply" className="text-xl font-semibold">
          {response.confirmedAt ? "Correct your classification" : "Confirm the outcome"}
        </h2>
        <ConfirmResponseForm
          key={response.classificationRevision}
          initial={{
            responseId: id,
            expectedRevision: String(response.classificationRevision),
            expectedRequestStatus: request?.status ?? "",
            classification: response.confirmedAt
              ? response.classification
              : response.suggestedClassification,
            effect: "keep",
          }}
          requestStatus={request?.status ?? null}
          submitted={Boolean(request?.sentAt)}
          hasContent={hasContent}
        />
      </section>
      <div className="border-t pt-6">
        <ConfirmSubmitButton
          action={deleteResponseAction}
          hidden={{ responseId: id }}
          label="Erase reply content"
          title="Erase this reply"
          description="The reply’s sender, subject, text and private provider data will be erased."
          consequences={[
            "Request status history and separately uploaded evidence remain. An opaque marker prevents provider retries from restoring this reply.",
          ]}
          destructive
        />
      </div>
    </div>
  );
}
