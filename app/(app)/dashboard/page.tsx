import { FileTextIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import type { RequestStatus } from "@prisma/client";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { REQUEST_STATUS_LABELS, StatusBadge } from "@/components/common/status-badge";
import { Timeline } from "@/components/common/timeline";
import { Button } from "@/components/ui/button";
import { resolveActiveProfileForRequest } from "@/app/_lib/active-profile";
import { getDateFormatter } from "@/app/_lib/datetime";
import { requireActorOrRedirect } from "@/lib/auth";
import { getEffectiveFairUse, getSetting } from "@/lib/config/runtimeSettings";
import { getOwnedDashboard } from "@/lib/db/repositories/dashboard";
import {
  NEEDS_USER_ACTION_STATUSES,
  WAITING_STATUSES,
} from "@/lib/requests/stateMachine";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const actor = await requireActorOrRedirect();
  const { active } = await resolveActiveProfileForRequest(actor);
  const [dashboard, fairUse, operatorNote, dates] = await Promise.all([
    getOwnedDashboard(actor, active?.id ?? null),
    getEffectiveFairUse(actor.userId),
    getSetting("instanceOperatorNote"),
    getDateFormatter(),
  ]);
  const count = (statuses: readonly RequestStatus[]) =>
    statuses.reduce((sum, status) => sum + (dashboard.byStatus.get(status) ?? 0), 0);
  const attentionCount = count(NEEDS_USER_ACTION_STATUSES);
  const completed = count(["COMPLETED"]);
  const partial = count(["PARTIALLY_COMPLETED"]);
  const detailed = [
    ["Total brokers selected", dashboard.brokerCount],
    [
      "Requests prepared",
      count(["PREPARED", "AWAITING_USER_APPROVAL", "MANUAL_REVIEW_REQUIRED"]),
    ],
    [
      "Requests awaiting approval",
      count(["AWAITING_USER_APPROVAL", "MANUAL_REVIEW_REQUIRED"]),
    ],
    ["Requests approved", count(["APPROVED"])],
    ["Requests sent", count(WAITING_STATUSES)],
    ["Requests completed or partially completed", completed + partial],
    ["Requests awaiting broker response", count(WAITING_STATUSES)],
    ["Requests needing user action", attentionCount],
    ["Upcoming deadlines", dashboard.upcomingCount],
  ] as const;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description={
          active
            ? `Working as ${active.displayName}.`
            : "Create a profile to start a removal workflow."
        }
        actions={
          <Button asChild>
            <Link href={active ? "/requests/new" : "/onboarding"}>
              {active ? "Start new removal workflow" : "Set up your profile"}
            </Link>
          </Button>
        }
      />

      {!active ? (
        <EmptyState
          icon={UserIcon}
          title="No profile yet"
          description="Set up your own profile first. Household profiles can be added later, with explicit consent."
        />
      ) : (
        <section aria-labelledby="attention-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="attention-title" className="text-lg font-semibold">
              Needs your attention
            </h2>
            <Link
              href="/requests"
              className="inline-flex min-h-11 items-center text-sm font-medium underline md:min-h-10"
            >
              All requests
            </Link>
          </div>
          {dashboard.attention.length ? (
            <>
              <ul className="divide-y border-y">
                {dashboard.attention.map((request) => {
                  const review = [
                    "AWAITING_USER_APPROVAL",
                    "MANUAL_REVIEW_REQUIRED",
                  ].includes(request.status);
                  return (
                    <li
                      key={request.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div className="min-w-0 space-y-2">
                        <p className="font-medium [overflow-wrap:anywhere]">
                          {request.broker.legalName}
                        </p>
                        <StatusBadge kind="request" status={request.status} />
                      </div>
                      <Button asChild variant="outline">
                        <Link href={`/requests/${request.id}${review ? "/review" : ""}`}>
                          {review ? "Review draft" : "Open request"}
                          <span className="sr-only"> for {request.broker.legalName}</span>
                        </Link>
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {attentionCount > dashboard.attention.length ? (
                <p className="text-sm text-muted-foreground">
                  Showing the {dashboard.attention.length} oldest items of{" "}
                  {attentionCount} requests needing your action.
                </p>
              ) : null}
            </>
          ) : (
            <EmptyState
              headingLevel={3}
              icon={FileTextIcon}
              title={dashboard.total ? "Nothing needs your action" : "No requests yet"}
              description={
                dashboard.total
                  ? "Your waiting requests and recent updates are listed below."
                  : "Choose a broker, prepare a draft, and review the exact message before approving it."
              }
            />
          )}
        </section>
      )}

      <section aria-label="Request summary" className="space-y-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 border-y py-6 xl:grid-cols-4">
          {[
            ["Needs your action", attentionCount],
            ["Waiting for broker", count(WAITING_STATUSES)],
            ["Completed", completed],
            ["Brokers selected", dashboard.brokerCount],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 space-y-2">
              <dt className="text-sm leading-5 text-muted-foreground">{label}</dt>
              <dd className="text-3xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <details className="group">
          <summary className="w-fit cursor-pointer py-2 text-sm font-medium">
            Detailed request counts
          </summary>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Current states across {dashboard.total} requests. Categories can overlap.
            Partially completed requests still need a decision.
          </p>
          <dl className="mt-4 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {detailed.map(([label, value]) => (
              <div
                key={label}
                className="flex items-baseline justify-between gap-4 border-t py-3 text-sm"
              >
                <dt>{label}</dt>
                <dd className="shrink-0 font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>

      {operatorNote ? (
        <section
          aria-labelledby="operator-note-title"
          className="space-y-2 border-l-2 pl-4"
        >
          <h2 id="operator-note-title" className="text-sm font-semibold">
            From the instance operator
          </h2>
          <p className="max-w-prose text-sm leading-6 [overflow-wrap:anywhere] whitespace-pre-wrap">
            {operatorNote}
          </p>
        </section>
      ) : null}

      <div className="grid min-w-0 gap-8 xl:grid-cols-2">
        <section aria-labelledby="recent-title" className="min-w-0 space-y-4">
          <h2 id="recent-title" className="text-lg font-semibold">
            Recent activity
          </h2>
          {dashboard.recent.length ? (
            <Timeline
              label="Recent activity"
              events={dashboard.recent.map((request) => ({
                id: request.id,
                timestamp: dates.formatStamp(request.updatedAt),
                dateTime: request.updatedAt.toISOString(),
                title: `${request.broker.legalName} · ${REQUEST_STATUS_LABELS[request.status]}`,
                detail: (
                  <Link className="underline" href={`/requests/${request.id}`}>
                    Open request
                  </Link>
                ),
              }))}
            />
          ) : (
            <EmptyState
              headingLevel={3}
              icon={FileTextIcon}
              title="No activity yet"
              description="Your request history will appear here."
            />
          )}
        </section>
        <section aria-labelledby="deadlines-title" className="min-w-0 space-y-4">
          <h2 id="deadlines-title" className="text-lg font-semibold">
            Upcoming deadlines
          </h2>
          {dashboard.upcoming.length ? (
            <>
              <ul className="divide-y border-y">
                {dashboard.upcoming.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm"
                  >
                    <Link
                      className="[overflow-wrap:anywhere] underline"
                      href={`/requests/${request.id}`}
                    >
                      {request.broker.legalName}
                    </Link>
                    <time
                      className="shrink-0 text-muted-foreground"
                      dateTime={request.deadlineAt?.toISOString()}
                    >
                      {dates.formatDate(request.deadlineAt)}
                    </time>
                  </li>
                ))}
              </ul>
              {dashboard.upcomingCount > dashboard.upcoming.length ? (
                <p className="text-sm text-muted-foreground">
                  Next {dashboard.upcoming.length} of {dashboard.upcomingCount} dates.
                  View each request for its legal basis and whether the date is an
                  estimate.
                </p>
              ) : null}
            </>
          ) : (
            <p className="border-t pt-4 text-sm leading-6 text-muted-foreground">
              No future response dates are recorded for waiting requests.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-6 border-t pt-6 lg:grid-cols-2">
        <section aria-labelledby="estimate-title" className="space-y-2">
          <h2 id="estimate-title" className="text-sm font-semibold">
            Completion and limitations
          </h2>
          <p className="max-w-prose text-sm leading-6 text-muted-foreground">
            {completed} of {dashboard.total} requests are marked completed
            {partial ? `; ${partial} are partially completed` : ""}. This is an estimate
            of workflow progress, not a measurement of remaining copies of your data.
            Brokers can refuse, ignore, or keep records they are legally allowed to keep.
          </p>
        </section>
        <section aria-labelledby="fair-use-title" className="space-y-2">
          <h2 id="fair-use-title" className="text-sm font-semibold">
            Fair use
          </h2>
          <p className="max-w-prose text-sm leading-6 text-muted-foreground">
            This instance allows {fairUse.requestsPerDay} new requests per day and{" "}
            {fairUse.requestsPerMonth} per month so it stays reliable. These are
            operational limits; there are no paid upgrades.
          </p>
        </section>
      </div>
    </div>
  );
}
