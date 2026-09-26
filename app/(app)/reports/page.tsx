import { randomUUID } from "node:crypto";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { resolveActiveProfileForRequest } from "@/app/_lib/active-profile";
import { getDateFormatter } from "@/app/_lib/datetime";
import { requireActorOrRedirect } from "@/lib/auth";
import { dateInTimeZone, formatIsoDate } from "@/lib/format/datetime";
import { listReports } from "@/lib/reports/service";
import { ReportForm, ReportJobAction, ReportRefresh } from "./report-forms";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    queued?: string;
    cursor?: string;
    filter?: string;
    profileId?: string;
  }>;
}) {
  const actor = await requireActorOrRedirect();
  const params = await searchParams;
  const filter = ["working", "ready", "failed"].includes(params.filter ?? "")
    ? params.filter!
    : "all";
  const [{ active, profiles }, { timeZone, formatStamp }, page] = await Promise.all([
    resolveActiveProfileForRequest(actor),
    getDateFormatter(),
    listReports(actor, {
      filter,
      profileId: params.profileId || null,
      cursor: params.cursor,
    }),
  ]);
  const today = dateInTimeZone(new Date(), timeZone);
  const previous = new Date(`${today}T00:00:00Z`);
  previous.setUTCFullYear(previous.getUTCFullYear() - 1);
  const working = page.items.some(
    (row) =>
      row.status !== "READY" &&
      row.job &&
      ["PENDING", "RETRYABLE", "RUNNING"].includes(row.job.status)
  );
  const href = (cursor?: string | null) =>
    `/reports?${new URLSearchParams({ filter, ...(params.profileId ? { profileId: params.profileId } : {}), ...(cursor ? { cursor } : {}) })}#report-history`;
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        title="Reports"
        description="A private summary of your requests and their recorded outcomes. It does not measure remaining copies of your data."
      />
      {params.queued ? (
        <p role="status" className="text-sm">
          Report queued. Its progress and download will appear below.
        </p>
      ) : null}
      <section className="space-y-5" aria-labelledby="generate-report">
        <h2 id="generate-report" className="text-xl font-semibold">
          Generate a report
        </h2>
        <ReportForm
          key={params.queued ?? "new"}
          initial={{
            dateFrom: previous.toISOString().slice(0, 10),
            dateTo: today,
            profileId: active?.id ?? "",
            format: "JSON",
            submissionKey: randomUUID(),
          }}
          profiles={profiles}
          timeZone={timeZone}
        />
      </section>
      <section
        id="report-history"
        aria-labelledby="report-history-title"
        className="space-y-5 border-t pt-6"
      >
        <h2 id="report-history-title" className="text-xl font-semibold">
          Your reports
        </h2>
        <form className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="report-filter">Status</Label>
            <select
              id="report-filter"
              name="filter"
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={filter}
            >
              <option value="all">All reports</option>
              <option value="working">In progress</option>
              <option value="ready">Ready</option>
              <option value="failed">Failed or cancelled</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-profile-filter">Profile</Label>
            <select
              id="report-profile-filter"
              name="profileId"
              className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={params.profileId ?? ""}
            >
              <option value="">All profiles</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName}
                </option>
              ))}
            </select>
          </div>
          <Button variant="outline">Apply filters</Button>
        </form>
        <ReportRefresh working={working} />
        {page.items.length ? (
          <ul aria-label="Reports" className="divide-y border-y">
            {page.items.map((report) => {
              const available =
                report.status === "READY" &&
                report.evidenceFile?.storageState === "READY" &&
                !report.evidenceFile.deletedAt &&
                (!report.evidenceFile.expiresAt ||
                  report.evidenceFile.expiresAt > new Date());
              const inProgress =
                report.status !== "READY" &&
                report.job &&
                ["PENDING", "RETRYABLE", "RUNNING"].includes(report.job.status);
              const status = available
                ? "Ready"
                : report.job?.status === "CANCELLED"
                  ? "Cancelled"
                  : inProgress
                    ? report.job?.status === "RETRYABLE"
                      ? "Retry scheduled"
                      : report.status === "GENERATING"
                        ? "Generating"
                        : "Queued"
                    : report.status === "READY"
                      ? "File no longer available"
                      : "Could not finish";
              return (
                <li
                  id={`report-${report.id}`}
                  key={report.id}
                  className="grid gap-4 py-5 md:grid-cols-[1fr_1fr_auto]"
                >
                  <div className="space-y-2">
                    <h3 className="font-semibold">
                      {formatIsoDate(report.dateFrom)} – {formatIsoDate(report.dateTo)}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {report.profile?.displayName ?? "All profiles"} · {report.format} ·{" "}
                      {report.timeZone}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Requested {formatStamp(report.createdAt)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium" role="status">
                      {status}
                    </p>
                    {report.status === "GENERATING" && inProgress ? (
                      <p className="text-sm">
                        {report.processedRequests} of {report.totalRequests} requests read
                      </p>
                    ) : null}
                    {available ? (
                      <p className="text-sm">
                        {report.sourceCutoffAt
                          ? `${report.totalRequests} requests`
                          : "Historical report"}
                      </p>
                    ) : null}
                    {report.job?.status === "RETRYABLE" && inProgress ? (
                      <p className="text-sm text-muted-foreground">
                        Next attempt: {formatStamp(report.job.runAt)}
                      </p>
                    ) : null}
                    {!available && !inProgress ? (
                      <p className="text-sm text-muted-foreground">
                        Generate again to rebuild this summary from the records still
                        available.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    {available ? (
                      <Button variant="outline" asChild>
                        <a href={`/api/reports/${report.id}/download`}>
                          Download {report.format}
                        </a>
                      </Button>
                    ) : (
                      <ReportJobAction
                        id={report.id}
                        operation={inProgress ? "cancel" : "retry"}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="space-y-2 border-y py-8">
            <h3 className="text-lg font-semibold">No reports in this view</h3>
            <p className="text-sm text-muted-foreground">
              Generate a report above, or change the filters to find earlier reports.
            </p>
          </div>
        )}
        <nav className="flex gap-3" aria-label="Report pages">
          {params.cursor ? (
            <Button asChild variant="outline">
              <Link href={href()}>First page</Link>
            </Button>
          ) : null}
          {page.nextCursor ? (
            <Button asChild variant="outline">
              <Link href={href(page.nextCursor)}>Next 25 reports</Link>
            </Button>
          ) : null}
        </nav>
      </section>
    </div>
  );
}
