import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAdminAudit,
  listBreakGlass,
  verifyAdminAuditChain,
} from "@/lib/admin/service";
import { requireRole } from "@/lib/auth";
import { getDateFormatter } from "@/app/_lib/datetime";
import { ListFilters } from "@/components/common/list-filters";
import { ListNavigation } from "@/components/common/list-navigation";
import { ListResultSummary } from "@/components/common/list-result-summary";

import { grantBreakGlassAction, revokeBreakGlassAction } from "../actions";

export const metadata = { title: "Admin audit" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    search?: string;
    outcome?: string;
    cursor?: string;
  }>;
}) {
  const actor = await requireRole("INSTANCE_ADMIN");
  const { formatStamp } = await getDateFormatter();
  const params = await searchParams;
  const [page, chain, grants] = await Promise.all([
    getAdminAudit(actor, params),
    verifyAdminAuditChain(actor),
    listBreakGlass(actor),
  ]);
  const { error } = params;

  return (
    <>
      <PageHeader
        title="Audit"
        description="Append-only hash chain. Metadata is scrubbed before storage."
      />
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>The grant could not be created</AlertTitle>
          <AlertDescription>
            Justification must be at least 20 characters.
          </AlertDescription>
        </Alert>
      ) : null}
      <Alert>
        <AlertTitle>Chain verification</AlertTitle>
        <AlertDescription>
          {chain.valid
            ? `Checked ${chain.checked} rows. No inconsistency found.`
            : `First problem at sequence ${chain.firstProblem?.sequence}: ${chain.firstProblem?.problem}.`}
        </AlertDescription>
      </Alert>

      <ListFilters
        path="/admin/audit"
        prefix="audit"
        searchLabel="Action or resource type"
        values={params}
        selects={[
          {
            name: "outcome",
            label: "Outcome",
            options: [
              { value: "all", label: "All outcomes" },
              { value: "SUCCESS", label: "Success" },
              { value: "DENIED", label: "Denied" },
              { value: "ERROR", label: "Error" },
            ],
          },
        ]}
      />
      <ListResultSummary
        shown={page.items.length}
        total={page.total}
        noun="event"
        order="Newest sequence first"
      />
      {!page.items.length ? (
        <section className="space-y-2 border-t py-6">
          <h2 className="text-lg font-semibold">No matching audit entries</h2>
          <p className="text-sm">Change the filters to review other events.</p>
        </section>
      ) : null}

      <Table scrollLabel="Audit entries">
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>Outcome</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.items.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{formatStamp(row.createdAt)}</TableCell>
              <TableCell className="font-mono text-xs">{row.action}</TableCell>
              <TableCell>
                {row.resourceType}
                {row.resourceId ? ` ${row.resourceId.slice(0, 8)}` : ""}
              </TableCell>
              <TableCell>{row.outcome}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ListNavigation
        path="/admin/audit"
        filters={{ search: params.search, outcome: params.outcome }}
        cursor={params.cursor}
        nextCursor={page.nextCursor}
        label="Audit results"
      />

      <section className="flex max-w-[680px] flex-col gap-4 border-t pt-6">
        <h2 className="font-heading text-base font-medium">Break-glass</h2>
        <p className="text-sm text-muted-foreground">
          Decrypting identifiers and downloading evidence stay blocked even with a grant.
        </p>
        <form action={grantBreakGlassAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="targetUserId">Target user id</Label>
            <Input id="targetUserId" name="targetUserId" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="justification">Justification</Label>
            <Textarea
              id="justification"
              name="justification"
              required
              minLength={20}
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="durationHours">Duration (hours)</Label>
            <Input
              id="durationHours"
              name="durationHours"
              type="number"
              min={1}
              max={24}
              defaultValue={1}
            />
          </div>
          <Button type="submit">Grant access</Button>
        </form>
        {grants.map((grant) => (
          <form
            key={grant.id}
            action={revokeBreakGlassAction}
            className="flex flex-wrap items-center justify-between gap-3 text-sm [overflow-wrap:anywhere]"
          >
            <span>
              {grant.targetUserId} until{" "}
              {grant.grantExpiresAt ? formatStamp(grant.grantExpiresAt) : "—"}
            </span>
            <input type="hidden" name="grantId" value={grant.id} />
            <Button type="submit" variant="outline" size="sm">
              Revoke
            </Button>
          </form>
        ))}
      </section>
    </>
  );
}
