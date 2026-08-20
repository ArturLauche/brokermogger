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
import { formatUtcStamp } from "@/lib/format/datetime";

import { cancelJobAction, retryJobAction } from "../actions";

export const metadata = { title: "Admin jobs" };

export default async function AdminJobsPage() {
  const actor = await requireRole("INSTANCE_ADMIN");
  const jobs = await getAdminJobs(actor);

  return (
    <>
      <PageHeader
        title="Jobs"
        description="PostgreSQL-backed queue. No Redis. Last errors are truncated."
      />
      <Table>
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
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell>{job.type}</TableCell>
              <TableCell>{job.status}</TableCell>
              <TableCell>{formatUtcStamp(job.runAt)}</TableCell>
              <TableCell>
                {job.attemptCount}/{job.maxAttempts}
              </TableCell>
              <TableCell className="max-w-xs truncate font-mono text-xs">
                {job.lastError ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-xs">
                {job.relatedRequestId ?? "—"}
              </TableCell>
              <TableCell className="flex gap-2">
                <ConfirmSubmitButton
                  action={retryJobAction}
                  hidden={{ jobId: job.id }}
                  label="Retry"
                  title="Retry this job"
                  description="The job will run again. Send handlers stay idempotent."
                />
                <ConfirmSubmitButton
                  action={cancelJobAction}
                  hidden={{ jobId: job.id }}
                  label="Cancel"
                  title="Cancel this job"
                  description="The job will not run again."
                  destructive
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
