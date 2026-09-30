import { ConfirmSubmitButton } from "@/components/common/confirm-submit-button";
import { PageHeader } from "@/components/common/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminJobs } from "@/lib/admin/service";
import { requireRole } from "@/lib/auth";
import { getDateFormatter } from "@/app/_lib/datetime";
import { JobStatus, JobType } from "@prisma/client";
import { ListFilters } from "@/components/common/list-filters";
import { ListNavigation } from "@/components/common/list-navigation";
import { ListResultSummary } from "@/components/common/list-result-summary";

import { cancelJobAction, retryJobAction } from "../actions";

export const metadata = { title: "Admin jobs" };

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    type?: string;
    cursor?: string;
  }>;
}) {
  const actor = await requireRole("INSTANCE_ADMIN");
  const { formatStamp } = await getDateFormatter();
  const params = await searchParams;
  const page = await getAdminJobs(actor, params);

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Background work, retry status and recoverable failures."
      />
      <ListFilters
        path="/admin/jobs"
        prefix="job"
        searchLabel="Job or request reference"
        values={params}
        selects={[
          {
            name: "status",
            label: "Status",
            options: [
              { value: "all", label: "All statuses" },
              ...Object.values(JobStatus).map((value) => ({
                value,
                label: value.toLowerCase(),
              })),
            ],
          },
          {
            name: "type",
            label: "Type",
            options: [
              { value: "all", label: "All types" },
              ...Object.values(JobType).map((value) => ({
                value,
                label: value.toLowerCase().replaceAll("_", " "),
              })),
            ],
          },
        ]}
      />
      <ListResultSummary shown={page.items.length} total={page.total} noun="job" />
      {!page.items.length ? (
        <section className="space-y-2 border-t py-6">
          <h2 className="text-lg font-semibold">No matching jobs</h2>
          <p className="text-sm">Change the filters to see other background work.</p>
        </section>
      ) : null}
      <Table scrollLabel="Background jobs">
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Run at</TableHead>
            <TableHead>Attempts</TableHead>
            <TableHead>Last error</TableHead>
            <TableHead>Request</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.map((job) => (
            <TableRow key={job.id}>
              <TableCell>{job.type}</TableCell>
              <TableCell>{job.status}</TableCell>
              <TableCell>{formatStamp(job.runAt)}</TableCell>
              <TableCell>
                {job.attemptCount}/{job.maxAttempts}
              </TableCell>
              <TableCell className="max-w-xs text-sm [overflow-wrap:anywhere] whitespace-normal">
                {job.lastError ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {job.relatedRequestId ?? "—"}
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  {["FAILED", "RETRYABLE"].includes(job.status) ? (
                    <ConfirmSubmitButton
                      action={retryJobAction}
                      hidden={{ jobId: job.id }}
                      label="Retry"
                      title="Retry this job"
                      description="The job will retry after checking its previous outcome."
                    />
                  ) : null}
                  {["PENDING", "RETRYABLE", "RUNNING"].includes(job.status) ? (
                    <ConfirmSubmitButton
                      action={cancelJobAction}
                      hidden={{ jobId: job.id }}
                      label="Cancel"
                      title="Cancel this job"
                      description="This stops future attempts. An operation already handed to an external provider may still complete; an accepted email cannot be recalled."
                      destructive
                    />
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ListNavigation
        path="/admin/jobs"
        filters={{ search: params.search, status: params.status, type: params.type }}
        cursor={params.cursor}
        nextCursor={page.nextCursor}
        label="Job results"
      />
    </>
  );
}
