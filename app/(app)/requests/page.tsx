import { SendIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resolveActiveProfileForRequest } from "@/app/_lib/active-profile";
import { requireActorOrRedirect } from "@/lib/auth";
import { listOwnedRequests } from "@/lib/db/repositories/requests";

export const metadata = { title: "Requests" };
export const dynamic = "force-dynamic";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const { active } = await resolveActiveProfileForRequest(actor);
  const requests = await listOwnedRequests(actor, active?.id ?? null);
  const { created } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Requests"
        description="Prepared, approved and sent privacy requests for the active profile."
        actions={
          <Button asChild>
            <Link href="/requests/new">Start new removal workflow</Link>
          </Button>
        }
      />
      {created ? (
        <Alert>
          <AlertDescription>
            {created} draft{created === "1" ? "" : "s"} prepared. Nothing has been sent.
          </AlertDescription>
        </Alert>
      ) : null}
      {requests.length === 0 ? (
        <EmptyState
          icon={SendIcon}
          title="No requests yet"
          description="Choose brokers and generate drafts. Every outbound message needs your approval."
          action={
            <Button asChild>
              <Link href="/requests/new">Start new removal workflow</Link>
            </Button>
          }
        />
      ) : (
        <Table scrollLabel="Privacy requests">
          <TableHeader>
            <TableRow>
              <TableHead>Broker</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Response target</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell>
                  <Link className="underline" href={`/requests/${request.id}`}>
                    {request.broker.legalName}
                  </Link>
                </TableCell>
                <TableCell>
                  {request.requestType.toLowerCase().replaceAll("_", " ")}
                </TableCell>
                <TableCell>
                  <StatusBadge kind="request" status={request.status} />
                </TableCell>
                <TableCell>
                  {request.deadlineOn
                    ? `${request.deadlineOn.toISOString().slice(0, 10)}${request.deadlineIsEstimate ? " (estimate)" : ""}`
                    : "—"}
                </TableCell>
                <TableCell>
                  {request.status === "AWAITING_USER_APPROVAL" ||
                  request.status === "MANUAL_REVIEW_REQUIRED" ? (
                    <Link className="underline" href={`/requests/${request.id}/review`}>
                      Review
                    </Link>
                  ) : (
                    <Link className="underline" href={`/requests/${request.id}`}>
                      Open
                    </Link>
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
