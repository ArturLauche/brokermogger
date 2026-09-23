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
import { canTransition } from "@/lib/requests/stateMachine";

import {
  closeRequestAction,
  markCompletedAction,
  prepareFollowUpAction,
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
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const { formatStamp } = await getDateFormatter();
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
  const canReview =
    request.status === "AWAITING_USER_APPROVAL" ||
    request.status === "MANUAL_REVIEW_REQUIRED";
  const canClose = canTransition(request.status, "CLOSED", "USER");
  const canComplete = canTransition(request.status, "COMPLETED", "USER");
  const canFollowUp = canTransition(request.status, "FOLLOW_UP_SCHEDULED", "USER");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={request.broker.legalName}
        description={`${request.requestType.toLowerCase().replaceAll("_", " ")} · ${request.jurisdiction.name}`}
        actions={<StatusBadge kind="request" status={request.status} />}
      />
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>The action could not be completed</AlertTitle>
          <AlertDescription>
            Error code: <code>{error}</code>
          </AlertDescription>
        </Alert>
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
        {snapshot &&
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
            <Button type="submit" variant="outline">
              Prepare follow up
            </Button>
          </form>
        ) : null}
        {canComplete ? (
          <form action={markCompletedAction}>
            <input type="hidden" name="requestId" value={request.id} />
            <Button type="submit" variant="outline">
              Mark completed
            </Button>
          </form>
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
        <Button asChild variant="outline">
          <Link href="/evidence">Upload evidence</Link>
        </Button>
      </div>
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
          <pre className="rounded-xl border p-4 font-mono text-xs whitespace-pre-wrap">
            {snapshot
              ? `Subject: ${snapshot.subject}\n\n${snapshot.body}`
              : "No snapshot has been rendered yet."}
          </pre>
        </TabsContent>
        <TabsContent value="evidence">
          <p className="text-sm text-muted-foreground">
            Files for this request are listed under{" "}
            <Link className="underline" href="/evidence">
              Evidence
            </Link>
            .
          </p>
        </TabsContent>
        <TabsContent value="responses">
          <p className="text-sm text-muted-foreground">
            Broker replies recorded on this request: {request.responses?.length ?? 0}.
            Incoming mail is classified when a provider webhook is configured.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
