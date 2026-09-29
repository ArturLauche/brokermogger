import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { requireActorOrRedirect } from "@/lib/auth";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { dateInTimeZone } from "@/lib/format/datetime";
import { getDateFormatter } from "@/app/_lib/datetime";
import { ManualSubmissionForm } from "../manual-forms";

export const metadata = { title: "Submit an approved request" };
export const dynamic = "force-dynamic";

export default async function ManualSubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const { id } = await params;
  const request = await getOwnedRequest(actor, id);
  const { timeZone } = await getDateFormatter();
  const snapshot = request.snapshots[0];
  const ready =
    request.channel !== "EMAIL" &&
    request.status === "NEEDS_USER_ACTION" &&
    snapshot &&
    request.approvedSnapshotId === snapshot.id &&
    request.approvedAt;
  const destination = request.destinationValue ?? "";
  const portal = /^https:\/\//i.test(destination) && request.channel !== "POSTAL";
  const today = dateInTimeZone(new Date(), timeZone);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Submit your approved request"
        description={request.broker.legalName}
      />
      {!ready ? (
        <div className="space-y-3">
          <p>
            This request needs a current manual-channel approval before you can record
            submission.
          </p>
          <Button asChild variant="outline">
            <Link href={`/requests/${id}`}>Return to request</Link>
          </Button>
        </div>
      ) : (
        <>
          <section aria-labelledby="submission-steps" className="space-y-4">
            <h2 id="submission-steps" className="text-xl font-semibold">
              Submit it yourself
            </h2>
            <ol className="list-decimal space-y-3 pl-6 text-sm leading-6">
              <li>
                Review the approved text below. If it needs changes, return to the request
                and create a new draft before submitting.
              </li>
              <li>
                {request.channel === "POSTAL"
                  ? "Print the approved message and post it to the address below. Keep a copy and any postal receipt."
                  : "Open the broker’s official portal or published instructions. Complete the required steps yourself using the approved text. This instance does not bypass logins or CAPTCHAs."}
              </li>
              <li>
                Keep the confirmation page or receipt, then record the submission date.
                Add the receipt date only when known.
              </li>
            </ol>
            <Link
              className="inline-block py-2 text-sm underline"
              href={`/brokers/${request.brokerId}`}
            >
              Review broker-specific sources and instructions
            </Link>
            <div className="border-l-2 pl-4">
              <p className="text-sm font-medium">Approved destination</p>
              {portal ? (
                <a
                  className="text-sm break-all underline underline-offset-4"
                  href={destination}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {destination} (opens a new tab)
                </a>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{destination}</p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Submitting is your action outside this instance. Approval alone has not
              submitted anything. Share only what the broker needs; do not send identity
              documents by default.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <a href={`/api/requests/${id}/download`}>Download approved text</a>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/evidence?requestId=${id}`}>Upload a receipt</Link>
              </Button>
            </div>
            <details className="border-y py-3">
              <summary className="cursor-pointer text-sm font-medium">
                View approved message (contains personal data)
              </summary>
              <div className="mt-4 space-y-4">
                <p className="font-semibold">{snapshot.subject}</p>
                <pre className="font-sans text-base leading-7 break-words whitespace-pre-wrap">
                  {snapshot.body}
                </pre>
              </div>
            </details>
          </section>
          <section
            aria-labelledby="record-submission"
            className="space-y-4 border-t pt-6"
          >
            <h2 id="record-submission" className="text-xl font-semibold">
              Record submission
            </h2>
            <ManualSubmissionForm
              initial={{
                requestId: id,
                snapshotId: snapshot.id,
                submittedOn: today,
                receivedOn: "",
                evidenceFileId: "",
              }}
              today={today}
              approvedOn={dateInTimeZone(request.approvedAt!, timeZone)}
              timeZone={timeZone}
              files={request.evidenceFiles
                .filter(
                  (file) =>
                    file.storageState === "READY" &&
                    file.kind !== "IDENTITY_DOCUMENT" &&
                    (!file.expiresAt || file.expiresAt > new Date())
                )
                .map((file) => ({
                  id: file.id,
                  label:
                    file.filenameMasked ??
                    `${file.kind.toLowerCase()} · ${file.id.slice(0, 8)}`,
                }))}
            />
          </section>
        </>
      )}
    </div>
  );
}
