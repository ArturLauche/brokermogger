import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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

import { grantBreakGlassAction, revokeBreakGlassAction } from "../actions";

export const metadata = { title: "Admin audit" };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const actor = await requireRole("INSTANCE_ADMIN");
  const { formatStamp } = await getDateFormatter();
  const [rows, chain, grants] = await Promise.all([
    getAdminAudit(actor),
    verifyAdminAuditChain(actor),
    listBreakGlass(actor),
  ]);
  const { error } = await searchParams;

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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>Outcome</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
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

      <section className="flex max-w-xl flex-col gap-3 rounded-xl border p-4">
        <h2 className="font-heading text-base font-medium">Break-glass</h2>
        <p className="text-sm text-muted-foreground">
          Decrypting identifiers and downloading evidence stay blocked even with a grant.
        </p>
        <form action={grantBreakGlassAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="targetUserId">Target user id</Label>
            <input
              id="targetUserId"
              name="targetUserId"
              required
              className="h-9 rounded-lg border border-input px-2"
            />
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
            <input
              id="durationHours"
              name="durationHours"
              type="number"
              min={1}
              max={24}
              defaultValue={1}
              className="h-9 rounded-lg border border-input px-2"
            />
          </div>
          <Button type="submit">Grant access</Button>
        </form>
        {grants.map((grant) => (
          <form
            key={grant.id}
            action={revokeBreakGlassAction}
            className="flex items-center justify-between gap-2 text-sm"
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
