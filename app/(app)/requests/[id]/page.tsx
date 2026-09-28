import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmitButton } from "@/components/common/confirm-submit-button";
import { DefinitionList } from "@/components/common/definition-list";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Timeline } from "@/components/common/timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireActorOrRedirect } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { formatIsoDate } from "@/lib/format/datetime";
import { getDateFormatter } from "@/app/_lib/datetime";
import { can } from "@/lib/permissions/policy";
import { canTransition } from "@/lib/requests/stateMachine";
import { ReconciliationForm, VerificationForm } from "./manual-forms";
import { getRequestWork } from "@/lib/db/repositories/requestWork";
import { BackgroundRefresh } from "@/components/common/background-refresh";
import { SubmitButton } from "@/components/common/submit-button";
import { RESPONSE_LABELS } from "@/lib/responses/labels";
import { canPrepareEscalation } from "@/lib/requests/escalationEligibility";
import { getSetting } from "@/lib/config/runtimeSettings";

import {
  closeRequestAction,
  markCompletedAction,
  prepareFollowUpAction,
  prepareEscalationAction,
  returnToDraftAction,
} from "../actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: `Request ${(await params).id.slice(0, 8)}` };
}

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const { formatStamp } = await getDateFormatter();
  const { id } = await params;
  const { error, saved } = await searchParams;

  let request;
  try {
    request = await getOwnedRequest(actor, id);
  } catch (caught) {
    if (isAppError(caught) && caught.code === "NOT_FOUND") {
      notFound();
    }
    throw caught;
  }

  const canManage = can(actor, "request:update", { ownerUserId: request.userId }).allowed;
  const work = await getRequestWork(actor, request.id);
  const followUpLimit = await getSetting("followUpMaxAttempts");
  const followUpFailed =
    canManage &&
    request.status === "FOLLOW_UP_SCHEDULED" &&
    (!work.followUp ||
      ["FAILED", "CANCELLED", "COMPLETED"].includes(work.followUp.status));
  const sendFailed =
    canManage &&
    request.status === "APPROVED" &&
    (!work.send || ["FAILED", "CANCELLED", "COMPLETED"].includes(work.send.status));
  const snapshot = request.snapshots[0];
  const canReview =
    canManage &&
    (request.status === "AWAITING_USER_APPROVAL" ||
      request.status === "MANUAL_REVIEW_REQUIRED");
  const canClose = canManage && canTransition(request.status, "CLOSED", "USER");
  const canComplete =
    canManage &&
    Boolean(request.sentAt) &&
    canTransition(request.status, "COMPLETED", "USER");
  const canFollowUp =
    canManage &&
    Boolean(request.sentAt) &&
    request.followUpCount < followUpLimit &&
    request.templateVersion?.template.requestType !== "FINAL_REMINDER" &&
    canTransition(request.status, "FOLLOW_UP_SCHEDULED", "USER");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={request.broker.legalName}
        description={`${request.requestType.toLowerCase().replaceAll("_", " ")} · ${request.jurisdiction.name}`}
        actions={<StatusBadge kind="request" status={request.status} />}
      />
      {(request.status === "APPROVED" && !sendFailed) ||
      (request.status === "FOLLOW_UP_SCHEDULED" && !followUpFailed) ? (
        <BackgroundRefresh
          working
          message="This page checks for updates while work is queued."
        />
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>The action could not be completed</AlertTitle>
          <AlertDescription>
            Error code: <code>{error}</code>
          </AlertDescription>
        </Alert>
      ) : null}
      {["submission", "reconciliation", "verification"].includes(saved ?? "") ? (
        <p role="status" className="text-sm">
          Your update is recorded in the request history.
        </p>
      ) : null}
      {canManage && request.status === "FOLLOW_UP_SCHEDULED" ? (
        <section className="space-y-3 border-y py-5" aria-labelledby="follow-up-state">
          <h2 id="follow-up-state" className="text-lg font-semibold">
            {followUpFailed
              ? "Follow-up preparation needs a retry"
              : work.followUp?.kind === "FINAL_REMINDER"
                ? "Final reminder scheduled"
                : "Follow-up scheduled"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {followUpFailed
              ? "Preparation did not finish. Try again, or close the request if you no longer need it."
              : `A draft will be prepared ${request.nextFollowUpAt ? formatStamp(request.nextFollowUpAt) : "shortly"}. It will need your review and fresh approval.`}
          </p>
          {followUpFailed ? (
            <form action={prepareFollowUpAction}>
              <input type="hidden" name="requestId" value={request.id} />
              <SubmitButton pendingText="Scheduling…">Retry preparation</SubmitButton>
            </form>
          ) : null}
        </section>
      ) : null}
      {sendFailed ||
      (request.status === "NEEDS_USER_ACTION" &&
        !request.approvedSnapshotId &&
        !request.outboundEmails.length) ? (
        <section className="space-y-3 border-y py-5" aria-labelledby="send-held">
          <h2 id="send-held" className="text-lg font-semibold">
            Sending stopped
          </h2>
          <p className="text-sm text-muted-foreground">
            Check the latest timeline entry for the reason. Update the profile or broker
            details if needed, then regenerate and approve a fresh draft. You can also
            close this request.
          </p>
        </section>
      ) : null}
      {canManage &&
      request.channel !== "EMAIL" &&
      request.status === "NEEDS_USER_ACTION" &&
      request.approvedSnapshotId === snapshot?.id ? (
        <section className="space-y-3 border-y py-5" aria-labelledby="manual-next-step">
          <h2 id="manual-next-step" className="text-lg font-semibold">
            Ready for you to submit
          </h2>
          <p className="text-sm text-muted-foreground">
            You approved this message. Nothing has been submitted yet. Follow the broker’s
            steps and record your submission.
          </p>
          <Button asChild>
            <Link href={`/requests/${request.id}/submit`}>Submit manually</Link>
          </Button>
        </section>
      ) : null}
      {request.outboundEmails.map((attempt) => (
        <section
          key={attempt.id}
          className="space-y-4 border-y py-5"
          aria-labelledby={`uncertain-${attempt.id}`}
        >
          <h2 id={`uncertain-${attempt.id}`} className="text-lg font-semibold">
            Resolve uncertain delivery
          </h2>
          <p className="text-sm">
            Attempt started{" "}
            {attempt.dispatchStartedAt
              ? formatStamp(attempt.dispatchStartedAt)
              : "at an unknown time"}
            .{" "}
            {attempt.dispatchState === "RECONCILIATION_REQUIRED"
              ? "Automatic sending is paused."
              : "Acceptance is not confirmed. A queued retry may reuse the same approved message."}
          </p>
          {work.send?.status === "RUNNING" &&
          work.send.lockExpiresAt &&
          work.send.lockExpiresAt > new Date() ? (
            <p className="text-sm text-muted-foreground">
              A send worker is still active. Wait for its result before recording a
              provider outcome.
            </p>
          ) : (
            <ReconciliationForm requestId={request.id} outboundEmailId={attempt.id} />
          )}
        </section>
      ))}
      {canManage && request.status === "BROKER_REQUESTED_VERIFICATION" ? (
        <section className="space-y-4 border-y py-5" aria-labelledby="verification-step">
          <h2 id="verification-step" className="text-lg font-semibold">
            The broker requested verification
          </h2>
          <VerificationForm requestId={request.id} />
        </section>
      ) : null}
      <DefinitionList
        layout="inline"
        items={[
          { term: "Profile", description: request.profile.displayName },
          {
            term: "Channel",
            description: request.channel.toLowerCase().replaceAll("_", " "),
          },
          { term: "Destination", description: request.destinationValue ?? "—" },
          { term: "Deadline", description: formatIsoDate(request.deadlineAt) },
          { term: "Legal basis", description: request.legalBasisText },
          { term: "Reference", description: request.externalReference ?? "—" },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        {canManage &&
        snapshot &&
        !request.outboundEmails.length &&
        (request.status === "DRAFT" || canTransition(request.status, "DRAFT", "USER")) ? (
          request.status === "APPROVED" ? (
            <form action={returnToDraftAction}>
              <input name="requestId" type="hidden" value={request.id} />
              <Button variant="outline">Withdraw approval and edit</Button>
            </form>
          ) : (
            <Button asChild variant="outline">
              <Link href={`/requests/${request.id}/edit`}>Edit draft</Link>
            </Button>
          )
        ) : null}
        {canReview ? (
          <Button asChild>
            <Link href={`/requests/${request.id}/review`}>Review</Link>
          </Button>
        ) : null}
        {canFollowUp ? (
          <form action={prepareFollowUpAction}>
            <input type="hidden" name="requestId" value={request.id} />
            <SubmitButton variant="outline" pendingText="Scheduling…">
              Prepare follow-up
            </SubmitButton>
          </form>
        ) : null}
        {canFollowUp && work.hasSubmittedFollowUp ? (
          <form action={prepareFollowUpAction}>
            <input type="hidden" name="requestId" value={request.id} />
            <input type="hidden" name="kind" value="FINAL_REMINDER" />
            <SubmitButton variant="outline" pendingText="Scheduling…">
              Prepare final reminder
            </SubmitButton>
          </form>
        ) : null}
        {canComplete ? (
          <ConfirmSubmitButton
            action={markCompletedAction}
            hidden={{ requestId: request.id }}
            label="Mark completed"
            title="Confirm reported completion"
            description="Use this when you verified completion outside the recorded correspondence."
            consequences={[
              "This records your confirmation and cancels queued sends and follow-ups. It does not guarantee removal or recall an accepted email.",
            ]}
          />
        ) : null}
        {canManage && canPrepareEscalation(request) ? (
          request.status === "ESCALATION_RECOMMENDED" ? (
            <Button asChild variant="outline">
              <Link href={`/requests/${request.id}/escalation`}>
                Review escalation summary
              </Link>
            </Button>
          ) : (
            <form action={prepareEscalationAction}>
              <input type="hidden" name="requestId" value={request.id} />
              <SubmitButton variant="outline" pendingText="Preparing…">
                Prepare escalation summary
              </SubmitButton>
            </form>
          )
        ) : null}
        {canClose ? (
          <ConfirmSubmitButton
            action={closeRequestAction}
            hidden={{ requestId: request.id }}
            label="Close"
            title="Close this request"
            description="Closed requests stay in the account until the retention period ends. You can still read the history."
            consequences={[
              "Queued sends and follow-ups will be cancelled. A send already started may still be delivered; accepted email cannot be recalled.",
            ]}
            destructive
          />
        ) : null}
        {canManage ? (
          <Button asChild variant="outline">
            <Link href={`/evidence?requestId=${request.id}`}>Upload evidence</Link>
          </Button>
        ) : null}
      </div>
      {canManage &&
      request.sentAt &&
      request.followUpCount >= followUpLimit &&
      canTransition(request.status, "FOLLOW_UP_SCHEDULED", "USER") ? (
        <p className="text-sm text-muted-foreground">
          This request has reached the instance’s limit of {followUpLimit} prepared
          reminders. This is an operational limit. Review the correspondence and
          escalation guidance, or close the request when appropriate.
        </p>
      ) : null}
      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="snapshot">Snapshot</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="responses">Broker responses</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline
                label="Request history"
                events={request.events.map((event) => ({
                  id: event.id,
                  title: event.type.replaceAll("_", " ").toLowerCase(),
                  timestamp: formatStamp(event.createdAt),
                  dateTime: event.createdAt.toISOString(),
                  actor: event.actorType.toLowerCase(),
                  detail: event.message,
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="snapshot">
          <details className="border-y py-4">
            <summary className="cursor-pointer text-sm font-medium">
              Reveal request text (contains personal data)
            </summary>
            <pre className="mt-4 font-sans text-base leading-7 break-words whitespace-pre-wrap">
              {snapshot
                ? `Subject: ${snapshot.subject}\n\n${snapshot.body}`
                : "No snapshot has been rendered yet."}
            </pre>
          </details>
        </TabsContent>
        <TabsContent value="evidence">
          {request.manualSubmissions.length ? (
            <section className="mb-6 space-y-3">
              <h2 className="text-lg font-semibold">Manual submissions</h2>
              <ul className="space-y-2 text-sm">
                {request.manualSubmissions.map((submission) => (
                  <li key={submission.id}>
                    Submitted {formatIsoDate(submission.submittedOn)}
                    {submission.receivedOn
                      ? ` · Receipt ${formatIsoDate(submission.receivedOn)}`
                      : " · Receipt date unknown"}
                    {submission.evidenceFileId ? (
                      <>
                        {" "}
                        ·{" "}
                        <a
                          className="underline"
                          href={`/api/evidence/${submission.evidenceFileId}/download`}
                        >
                          View receipt
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                Dates recorded by the account holder.
              </p>
            </section>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Files for this request are listed under{" "}
            <Link className="underline" href="/evidence">
              Evidence
            </Link>
            .
          </p>
        </TabsContent>
        <TabsContent value="responses">
          <section className="space-y-4" aria-labelledby="request-replies">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="request-replies" className="text-lg font-semibold">
                Broker replies
              </h2>
              <Button asChild>
                <Link href={`/requests/${request.id}/responses/new`}>Record a reply</Link>
              </Button>
            </div>
            {request.responses.length ? (
              <ul className="divide-y">
                {request.responses.map((response) => (
                  <li
                    key={response.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="text-sm">
                        {response.confirmedAt
                          ? RESPONSE_LABELS[response.classification]
                          : "Awaiting your review"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {response.receivedOn
                          ? formatIsoDate(response.receivedOn)
                          : formatStamp(response.receivedAt)}
                      </p>
                    </div>
                    <Link
                      className="text-sm underline"
                      href={`/responses/${response.id}`}
                    >
                      Review reply
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No replies recorded. Paste a broker response or attach evidence, then
                confirm its meaning. Received email also needs your confirmation before
                changing this request.
              </p>
            )}
            {request._count.responses > request.responses.length ? (
              <p className="text-sm">
                Showing the latest 25 of {request._count.responses} replies.{" "}
                <Link href="/responses" className="underline">
                  Browse all correspondence
                </Link>
                .
              </p>
            ) : null}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
