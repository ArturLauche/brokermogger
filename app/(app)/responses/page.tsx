import Link from "next/link";
import { requireActorOrRedirect } from "@/lib/auth";
import { listOwnedResponses } from "@/lib/db/repositories/responses";
import { getDateFormatter } from "@/app/_lib/datetime";
import { formatIsoDate } from "@/lib/format/datetime";
import { PageHeader } from "@/components/common/page-header";
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
import { RESPONSE_LABELS } from "@/lib/responses/labels";
import { readListResult } from "@/app/_lib/list-result";
import { ListInputErrorPage } from "@/components/common/list-input-error";

export const metadata = { title: "Correspondence" };
export const dynamic = "force-dynamic";

export default async function ResponsesPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; filter?: string; deleted?: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const params = await searchParams;
  const filter = params.filter ?? "all";
  const result = await readListResult(
    listOwnedResponses(actor, { cursor: params.cursor, filter })
  );
  if (!result.ok) return <ListInputErrorPage title="Correspondence" path="/responses" />;
  const page = result.value;
  const { formatStamp } = await getDateFormatter();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Correspondence"
        description="Correspondence across all your profiles. Review replies and match messages received at your private reply address."
        actions={
          <Button asChild variant="outline">
            <Link href="/requests">Open requests</Link>
          </Button>
        }
      />
      {params.deleted === "1" ? (
        <p role="status" className="text-sm">
          The reply’s content was erased. Linked request history and separately uploaded
          files remain.
        </p>
      ) : null}
      <form className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="filter">Show</Label>
          <select
            id="filter"
            name="filter"
            defaultValue={filter}
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All correspondence</option>
            <option value="review">Awaiting review</option>
            <option value="unmatched">Unmatched replies</option>
          </select>
        </div>
        <Button variant="outline">Apply filter</Button>
      </form>
      {page.items.length ? (
        <Table scrollLabel="Broker correspondence">
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Review</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.broker?.legalName ?? "Unmatched reply"}</TableCell>
                <TableCell>
                  {row.receivedOn
                    ? formatIsoDate(row.receivedOn)
                    : formatStamp(row.receivedAt)}
                </TableCell>
                <TableCell>
                  {row.confirmedAt
                    ? RESPONSE_LABELS[row.classification]
                    : "Awaiting your confirmation"}
                </TableCell>
                <TableCell>
                  <Link
                    className="underline underline-offset-4"
                    href={`/responses/${row.id}`}
                  >
                    Review
                    <span className="sr-only">
                      {" "}
                      reply from {row.broker?.legalName ?? "an unmatched sender"}
                    </span>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="space-y-2 border-y py-8">
          <h2 className="text-lg font-semibold">No replies in this view</h2>
          <p className="text-sm text-muted-foreground">
            Record a reply from its request page. When receiving is configured, replies to
            your private address also appear here.
          </p>
        </div>
      )}
      <nav className="flex gap-3" aria-label="Correspondence pages">
        {params.cursor ? (
          <Button asChild variant="outline">
            <Link href={`/responses?filter=${filter}`}>First page</Link>
          </Button>
        ) : null}
        {page.nextCursor ? (
          <Button asChild variant="outline">
            <Link href={`/responses?filter=${filter}&cursor=${page.nextCursor}`}>
              Next 25 replies
            </Link>
          </Button>
        ) : null}
      </nav>
    </div>
  );
}
