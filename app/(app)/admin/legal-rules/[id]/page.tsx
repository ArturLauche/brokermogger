import Link from "next/link";
import { notFound } from "next/navigation";
import { EditorForm } from "@/components/admin/editor-form";
import { PageHeader } from "@/components/common/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireRole } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { getLegalRuleAdministration } from "@/lib/db/repositories/adminLegalRules";
import { formatIsoDate, formatUtcStamp } from "@/lib/format/datetime";
import { updateLegalRuleAction, deactivateLegalRuleAction } from "../actions";
import { legalMetadataFields } from "../fields";

export const metadata = { title: "Legal rule history" };
export default async function LegalRuleHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; cursor?: string }>;
}) {
  const actor = await requireRole("MAINTAINER");
  const filters = await searchParams;
  let result;
  try {
    result = await getLegalRuleAdministration(actor, {
      legalRuleId: (await params).id,
      cursor: filters.cursor,
    });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const { legalRule, versions } = result;
  const scope = {
    legalRuleId: legalRule.id,
    expectedUpdatedAt: legalRule.updatedAt.toISOString(),
  };
  const now = new Date();
  return (
    <>
      <PageHeader
        title={legalRule.shortName}
        description={legalRule.jurisdiction.name + " · " + legalRule.lawName}
      />
      <Link className="text-sm underline" href="/admin/legal-rules">
        Back to legal rules
      </Link>
      {filters.saved === "details" ? (
        <p role="status" className="text-sm">
          Rule details saved.
        </p>
      ) : null}
      {filters.saved === "inactive" ? (
        <p role="status" className="text-sm">
          Rule deactivated. Published history and existing snapshots are preserved.
        </p>
      ) : null}
      <div className="max-w-[680px] space-y-8">
        <section className="space-y-4" aria-labelledby="rule-details">
          <h2 id="rule-details" className="text-lg font-semibold">
            Rule details
          </h2>
          <p className="text-sm text-muted-foreground">
            Stable key: <code>{legalRule.key}</code>. Create another rule to change the
            jurisdiction or key.
          </p>
          <EditorForm
            key={scope.expectedUpdatedAt}
            action={updateLegalRuleAction}
            initialValues={{
              ...scope,
              lawName: legalRule.lawName,
              shortName: legalRule.shortName,
              description: legalRule.description ?? "",
            }}
            fields={legalMetadataFields}
          />
        </section>
        <section className="space-y-4 border-t pt-6" aria-labelledby="rule-availability">
          <h2 id="rule-availability" className="text-lg font-semibold">
            Availability
          </h2>
          <p className="text-sm">
            {legalRule.isActive
              ? "Enabled. Only an effective, unexpired published version can be selected. A scheduled future version does not replace the current version early."
              : "Inactive. Publish a reviewed draft to enable this rule."}
          </p>
          {legalRule.isActive ? (
            <EditorForm
              action={deactivateLegalRuleAction}
              initialValues={scope}
              fields={[]}
              submitLabel="Deactivate legal rule"
            />
          ) : null}
        </section>
      </div>
      <section className="space-y-4 border-t pt-6" aria-labelledby="legal-history">
        <h2 id="legal-history" className="text-lg font-semibold">
          Version history
        </h2>
        <p className="text-sm text-muted-foreground">
          Open a version to review its sources, edit a draft or create a correction.
          Published content remains immutable.
        </p>
        <Table scrollLabel="Legal version history">
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Effective from</TableHead>
              <TableHead>Reviewed</TableHead>
              <TableHead>Review notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.items.map((version) => (
              <TableRow key={version.id}>
                <TableCell>
                  <Link
                    className="inline-block py-2 font-medium underline"
                    href={
                      "/admin/legal-rules/" + legalRule.id + "/versions/" + version.id
                    }
                  >
                    Version {version.version}
                  </Link>
                </TableCell>
                <TableCell>
                  {version.status === "PUBLISHED" && version.effectiveFrom > now
                    ? "scheduled"
                    : version.status.toLowerCase()}
                  {version.requiresLegalReview ? " · legal review required" : ""}
                </TableCell>
                <TableCell>{formatUtcStamp(version.effectiveFrom)}</TableCell>
                <TableCell>{formatIsoDate(version.lastReviewedAt)}</TableCell>
                <TableCell className="max-w-sm whitespace-normal">
                  {version.changeNotes || "No review notes yet"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!versions.items.length ? <p className="text-sm">No versions yet.</p> : null}
        <nav aria-label="Legal version pages" className="flex gap-4 text-sm">
          {filters.cursor ? (
            <Link className="underline" href={"/admin/legal-rules/" + legalRule.id}>
              First page
            </Link>
          ) : null}
          {versions.nextCursor ? (
            <Link
              className="underline"
              href={
                "/admin/legal-rules/" +
                legalRule.id +
                "?" +
                new URLSearchParams({ cursor: versions.nextCursor })
              }
            >
              Next page
            </Link>
          ) : null}
        </nav>
      </section>
    </>
  );
}
