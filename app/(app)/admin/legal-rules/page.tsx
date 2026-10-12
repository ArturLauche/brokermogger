import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { listLegalRuleAdministration } from "@/lib/db/repositories/adminLegalRules";
import { listActiveJurisdictions } from "@/lib/db/repositories/catalog";
import { formatIsoDate } from "@/lib/format/datetime";
import { LEGAL_REVIEW_INTERVAL_DAYS, reviewAge } from "@/lib/catalogue/reviewAge";

export const metadata = { title: "Admin legal rules" };
export default async function AdminLegalRulesPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    jurisdictionId?: string;
    cursor?: string;
  }>;
}) {
  const actor = await requireRole("MAINTAINER");
  const filters = await searchParams;
  const [page, jurisdictions] = await Promise.all([
    listLegalRuleAdministration(actor, filters),
    listActiveJurisdictions(),
  ]);
  const query = new URLSearchParams({
    search: filters.search ?? "",
    status: filters.status ?? "all",
    jurisdictionId: filters.jurisdictionId ?? "",
  });
  const next = new URLSearchParams(query);
  if (page.nextCursor) next.set("cursor", page.nextCursor);
  const now = new Date();
  return (
    <>
      <PageHeader
        title="Legal rules"
        description="Draft, source, preview and publish jurisdiction rules. Published text stays immutable; future versions become applicable only at their verified effective time."
        actions={
          <Button asChild>
            <Link href="/admin/legal-rules/new">Add legal rule</Link>
          </Button>
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="w-full min-w-0 space-y-2 sm:w-auto sm:flex-1">
          <Label htmlFor="legal-search">Search legal rules</Label>
          <Input
            id="legal-search"
            name="search"
            defaultValue={filters.search ?? ""}
            maxLength={100}
          />
        </div>
        <div className="w-full min-w-0 space-y-2 sm:w-auto">
          <Label htmlFor="legal-status">Show</Label>
          <select
            id="legal-status"
            name="status"
            defaultValue={filters.status ?? "all"}
            className="h-11 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto md:h-10"
          >
            <option value="all">All rules</option>
            <option value="draft">Has draft</option>
            <option value="published">Published rules</option>
            <option value="scheduled">Future publication</option>
            <option value="inactive">Inactive</option>
            <option value="review">Has source or legal review work</option>
          </select>
        </div>
        <div className="w-full min-w-0 space-y-2 sm:w-auto">
          <Label htmlFor="legal-jurisdiction">Jurisdiction</Label>
          <select
            id="legal-jurisdiction"
            name="jurisdictionId"
            defaultValue={filters.jurisdictionId ?? ""}
            className="h-11 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto md:h-10"
          >
            <option value="">All jurisdictions</option>
            {jurisdictions.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
        <Link href="/admin/legal-rules" className="py-2 text-sm underline">
          Reset
        </Link>
      </form>
      <p className="text-sm text-muted-foreground">
        {page.total} matching {page.total === 1 ? "rule" : "rules"}. Newest entries first.
      </p>
      <p className="text-sm text-muted-foreground">
        Source reviews are flagged after 180 days as an operator reminder. This does not
        change legal conclusions, publication or effective dates.
        {filters.status === "review"
          ? " Each row shows the oldest draft or published version needing review; archived and superseded versions are excluded."
          : " Review dates below refer to the latest version, which may be a draft or a future publication."}
      </p>
      {page.items.length ? (
        <Table scrollLabel="Legal rule administration results">
          <TableHeader>
            <TableRow>
              <TableHead>Law</TableHead>
              <TableHead>Jurisdiction</TableHead>
              <TableHead>Availability</TableHead>
              <TableHead>
                {filters.status === "review" ? "Version to review" : "Latest version"}
              </TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Reviewed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((rule) => {
              const latest = rule.versions[0];
              return (
                <TableRow key={rule.id}>
                  <TableCell>
                    <Link
                      className="inline-block py-2 font-medium underline"
                      href={"/admin/legal-rules/" + rule.id}
                    >
                      {rule.shortName}
                    </Link>
                  </TableCell>
                  <TableCell>{rule.jurisdiction.code}</TableCell>
                  <TableCell>{rule.isActive ? "Enabled" : "Inactive"}</TableCell>
                  <TableCell>
                    {latest
                      ? "Version " +
                        latest.version +
                        " · " +
                        (latest.status === "PUBLISHED" && latest.effectiveFrom > now
                          ? "scheduled"
                          : latest.status.toLowerCase())
                      : "No version"}
                  </TableCell>
                  <TableCell>
                    {latest
                      ? latest.confidence.toLowerCase() +
                        (latest.requiresLegalReview ? " · review required" : "")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <p>{formatIsoDate(latest?.lastReviewedAt)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {
                        reviewAge(latest?.lastReviewedAt, LEGAL_REVIEW_INTERVAL_DAYS, now)
                          .label
                      }
                    </p>
                    {latest &&
                    (!latest.sourceUrl || !latest.sourceTitle || !latest.reviewedBy) ? (
                      <p className="mt-1 text-sm">Source or reviewer evidence missing</p>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="space-y-2 border-t py-6">
          <h2 className="text-lg font-semibold">No matching rules</h2>
          <p className="text-sm">Change the filters or create a sourced draft.</p>
        </div>
      )}
      <nav aria-label="Legal rule result pages" className="flex gap-4 text-sm">
        {filters.cursor ? (
          <Link className="underline" href={"/admin/legal-rules?" + query}>
            First page
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link className="underline" href={"/admin/legal-rules?" + next}>
            Next page
          </Link>
        ) : null}
      </nav>
    </>
  );
}
