import Link from "next/link";
import { LetterPreview } from "@/components/common/letter-preview";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { requireActorOrRedirect } from "@/lib/auth";
import { loadPrivateRequest } from "@/app/_lib/private-request";
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
  const request = await loadPrivateRequest(actor, id);
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
        title={
          request.channel === "DROP"
            ? "Complete your approved DROP steps"
            : "Submit your approved request"
        }
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
                {request.channel === "DROP"
                  ? "Open the official California DROP platform. Verify residency and complete its required fields there. Review the broker scope before submitting or checking an existing request. No platform login, tracking ID or additional identity field is stored here."
                  : request.channel === "POSTAL"
                    ? "Print the approved message and post it to the address below. Keep a copy and any postal receipt."
                    : "Open the broker’s official portal or published instructions. Complete the required steps yourself using the approved text. This instance does not bypass logins or CAPTCHAs."}
              </li>
              <li>
                {request.channel === "DROP"
                  ? "Keep your DROP ID privately outside this instance. Redact it and other unnecessary personal details from any uploaded confirmation. Record the submission date and each broker's actual outcome."
                  : "Keep the confirmation page or receipt, then record the submission date. Add the receipt date only when known."}
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
            {request.channel === "DROP" ? (
              <p className="text-sm leading-6">
                Checking an existing status is not a new submission.{" "}
                <Link href={`/requests/${id}/responses/new`} className="underline">
                  Record the platform outcome as a response
                </Link>{" "}
                instead of recording another submission date.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <a href={`/api/requests/${id}/download`}>Download approved text</a>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/evidence?requestId=${id}`}>Upload a receipt</Link>
              </Button>
            </div>
            <LetterPreview
              subject={snapshot.subject}
              body={snapshot.body}
              label="View approved message (contains personal data)"
            />
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
              instructionsOnly={request.channel === "DROP"}
            />
          </section>
        </>
      )}
    </div>
  );
}
