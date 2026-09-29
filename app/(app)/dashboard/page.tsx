import { FileTextIcon, UserIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Timeline } from "@/components/common/timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveActiveProfileForRequest } from "@/app/_lib/active-profile";
import { requireActorOrRedirect } from "@/lib/auth";
import { getEffectiveFairUse, getSetting } from "@/lib/config/runtimeSettings";
import {
  countDistinctOwnedBrokers,
  listRecentOwnedRequests,
  listUpcomingDeadlines,
  summarizeOwnedRequests,
} from "@/lib/db/repositories/requests";
import type { RequestStatus } from "@prisma/client";
import {
  NEEDS_USER_ACTION_STATUSES,
  WAITING_STATUSES,
} from "@/lib/requests/stateMachine";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requireActorOrRedirect();
  const { active } = await resolveActiveProfileForRequest(actor);
  const profileId = active?.id ?? null;
  const [summary, requests, upcoming, fairUse, brokerCount, operatorNote] =
    await Promise.all([
      summarizeOwnedRequests(actor, profileId),
      listRecentOwnedRequests(actor, profileId, 8),
      listUpcomingDeadlines(actor, profileId, 5),
      getEffectiveFairUse(actor.userId),
      countDistinctOwnedBrokers(actor, profileId),
      getSetting("instanceOperatorNote"),
    ]);

  const count = (statuses: readonly RequestStatus[]) =>
    statuses.reduce((sum, status) => sum + (summary.byStatus.get(status) ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={
          active
            ? `Working as ${active.displayName}.`
            : "Create a profile to start a removal workflow."
        }
        actions={
          <Button asChild>
            <Link href="/requests/new">Start new removal workflow</Link>
          </Button>
        }
      />

      {operatorNote ? (
        <section
          aria-labelledby="operator-note-title"
          className="space-y-2 border-l-2 border-border pl-4"
        >
          <h2 id="operator-note-title" className="text-sm font-semibold">
            From the instance operator
          </h2>
          <p className="text-sm leading-6 whitespace-pre-wrap">{operatorNote}</p>
        </section>
      ) : null}

      {!active ? (
        <EmptyState
          icon={UserIcon}
          title="No profile yet"
          description="Set up your own profile first. Household profiles can be added later, with explicit consent."
          action={
            <Button asChild>
              <Link href="/onboarding">Set up your profile</Link>
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total brokers selected" value={brokerCount} />
        <StatCard
          label="Requests prepared"
          value={count(["PREPARED", "AWAITING_USER_APPROVAL", "MANUAL_REVIEW_REQUIRED"])}
        />
        <StatCard
          label="Requests awaiting approval"
          value={count(["AWAITING_USER_APPROVAL", "MANUAL_REVIEW_REQUIRED"])}
        />
        <StatCard label="Requests approved" value={count(["APPROVED"])} />
        <StatCard
          label="Requests sent"
          value={count(["SENT", "DELIVERED", "WAITING_FOR_BROKER", "FOLLOW_UP_SENT"])}
        />
        <StatCard
          label="Requests completed"
          value={count(["COMPLETED", "PARTIALLY_COMPLETED"])}
        />
        <StatCard
          label="Requests awaiting broker response"
          value={count(WAITING_STATUSES)}
        />
        <StatCard
          label="Requests needing user action"
          value={count(NEEDS_USER_ACTION_STATUSES)}
        />
        <StatCard label="Upcoming deadlines" value={upcoming.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exposure reduction estimate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Estimate only: {count(["COMPLETED"])} of {summary.total || 0} requests are
            marked completed. This is not a measurement of remaining copies of your data.
            Brokers can refuse, ignore or keep records they are legally allowed to keep.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fair use</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Limits exist so this instance stays reliable. They are not a paid upgrade.
            Current budget: {fairUse.requestsPerDay} new requests per day and{" "}
            {fairUse.requestsPerMonth} per month.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <EmptyState
              icon={FileTextIcon}
              title="No activity yet"
              description="Generate a draft, review it, and approve it. Nothing is sent without that step."
            />
          ) : (
            <Timeline
              label="Recent activity"
              events={requests.slice(0, 8).map((request) => ({
                id: request.id,
                timestamp:
                  request.updatedAt.toISOString().slice(0, 16).replace("T", " ") + " UTC",
                dateTime: request.updatedAt.toISOString(),
                title: `${request.broker.legalName} — ${request.status.replaceAll("_", " ").toLowerCase()}`,
                detail: (
                  <Link className="underline" href={`/requests/${request.id}`}>
                    Open request
                  </Link>
                ),
              }))}
            />
          )}
        </CardContent>
      </Card>

      {upcoming.length > 0 ? (
        <Alert>
          <AlertTitle>Upcoming deadlines</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {upcoming.map((request) => (
                <li key={request.id}>
                  <Link className="underline" href={`/requests/${request.id}`}>
                    {request.broker.legalName}
                  </Link>
                  {request.deadlineAt
                    ? ` — ${request.deadlineAt.toISOString().slice(0, 10)}`
                    : ""}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
