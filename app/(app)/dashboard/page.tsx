import { FileTextIcon, UserIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Timeline } from "@/components/common/timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActorOrRedirect } from "@/lib/auth";
import { listOwnedRequests } from "@/lib/db/repositories/requests";
import { resolveActiveProfile } from "@/lib/profiles/resolveActive";
import {
  NEEDS_USER_ACTION_STATUSES,
  WAITING_STATUSES,
} from "@/lib/requests/stateMachine";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requireActorOrRedirect();
  const { active } = await resolveActiveProfile(actor);
  const requests = active
    ? await listOwnedRequests(actor, active.id)
    : await listOwnedRequests(actor, null);

  const count = (statuses: readonly string[]) =>
    requests.filter((request) => statuses.includes(request.status)).length;

  const upcoming = requests
    .filter((request) => request.deadlineAt && request.deadlineAt > new Date())
    .sort((a, b) => (a.deadlineAt?.getTime() ?? 0) - (b.deadlineAt?.getTime() ?? 0))
    .slice(0, 5);

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
        <StatCard
          label="Total brokers selected"
          value={new Set(requests.map((r) => r.brokerId)).size}
        />
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
            Estimate only: {count(["COMPLETED"])} of {requests.length || 0} requests are
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
            Default budget: 25 new requests per day and 200 per month.
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
