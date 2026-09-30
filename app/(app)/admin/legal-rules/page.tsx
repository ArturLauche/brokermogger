import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminLegalRules } from "@/lib/admin/service";
import { requireRole } from "@/lib/auth";
import { formatIsoDate } from "@/lib/format/datetime";

export const metadata = { title: "Admin legal rules" };

export default async function AdminLegalRulesPage() {
  const actor = await requireRole("MAINTAINER");
  const rules = await getAdminLegalRules(actor);

  return (
    <>
      <PageHeader
        title="Legal rules"
        description="Published versions are immutable. Create a new draft version instead of editing a published row."
      />
      <Table scrollLabel="Legal rules">
        <TableHeader>
          <TableRow>
            <TableHead>Law</TableHead>
            <TableHead>Jurisdiction</TableHead>
            <TableHead>Latest version</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Reviewed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => {
            const latest = rule.versions[0];
            return (
              <TableRow key={rule.id}>
                <TableCell>{rule.lawName}</TableCell>
                <TableCell>{rule.jurisdiction.code}</TableCell>
                <TableCell>
                  {latest ? `v${latest.version} ${latest.status}` : "—"}
                  {latest?.requiresLegalReview ? (
                    <Badge variant="outline">Review</Badge>
                  ) : null}
                </TableCell>
                <TableCell>{latest?.confidence ?? "—"}</TableCell>
                <TableCell>
                  {latest ? formatIsoDate(latest.lastReviewedAt) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
