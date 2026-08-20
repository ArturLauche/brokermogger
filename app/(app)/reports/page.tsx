import { FileTextIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireActorOrRedirect } from "@/lib/auth";
import { formatIsoDate } from "@/lib/format/datetime";
import { resolveActiveProfile } from "@/lib/profiles/resolveActive";
import { listReports } from "@/lib/reports/service";

import { generateReportAction } from "./actions";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ queued?: string; error?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const { active, profiles } = await resolveActiveProfile(actor);
  const reports = await listReports(actor, null);
  const params = await searchParams;
  const todayDate = new Date();
  const today = todayDate.toISOString().slice(0, 10);
  const fromDate = new Date(todayDate);
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 1);
  const yearAgo = fromDate.toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description="A date-range summary of what this instance prepared and sent. It is not a measurement of remaining copies."
      />
      {params.queued ? (
        <Alert>
          <AlertTitle>Report queued.</AlertTitle>
          <AlertDescription>
            Refresh after the worker has processed the GENERATE_REPORT job.
          </AlertDescription>
        </Alert>
      ) : null}
      {params.error ? (
        <Alert variant="destructive">
          <AlertTitle>The report could not be created</AlertTitle>
          <AlertDescription>
            Check that the end date is after the start date and the range is at most 24
            months.
          </AlertDescription>
        </Alert>
      ) : null}

      <form
        action={generateReportAction}
        className="flex max-w-xl flex-col gap-3 rounded-xl border p-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateFrom">From</Label>
          <input
            id="dateFrom"
            name="dateFrom"
            type="date"
            required
            defaultValue={yearAgo}
            className="h-9 rounded-lg border border-input px-2"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateTo">To</Label>
          <input
            id="dateTo"
            name="dateTo"
            type="date"
            required
            defaultValue={today}
            className="h-9 rounded-lg border border-input px-2"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profileId">Profile</Label>
          <select
            id="profileId"
            name="profileId"
            className="h-9 rounded-lg border border-input px-2"
            defaultValue={active?.id ?? ""}
          >
            <option value="">All profiles</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.displayName}
              </option>
            ))}
          </select>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Format</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="format" value="JSON" defaultChecked />
            JSON
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="format" value="PDF" />
            PDF
          </label>
        </fieldset>
        <Button type="submit">Generate report</Button>
      </form>

      {reports.length === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title="No reports yet"
          description="Choose a date range and generate a JSON or PDF summary."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Range</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Download</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reports.map((report) => (
              <TableRow key={report.id}>
                <TableCell>
                  {formatIsoDate(report.dateFrom)} – {formatIsoDate(report.dateTo)}
                </TableCell>
                <TableCell>{report.format}</TableCell>
                <TableCell>{report.status.toLowerCase()}</TableCell>
                <TableCell>
                  {report.status === "READY" && report.evidenceFileId ? (
                    <Link
                      className="underline"
                      href={`/api/evidence/${report.evidenceFileId}/download`}
                    >
                      Download {report.format}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
