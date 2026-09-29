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
import { listTemplateAdministration } from "@/lib/db/repositories/adminTemplates";
import { REQUEST_TYPE_LABELS } from "@/lib/requests/labels";

export const metadata = { title: "Admin request templates" };
export default async function AdminTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; cursor?: string }>;
}) {
  const actor = await requireRole("MAINTAINER");
  const filters = await searchParams;
  const page = await listTemplateAdministration(actor, filters);
  const query = new URLSearchParams({
    search: filters.search ?? "",
    status: filters.status ?? "all",
  });
  const next = new URLSearchParams(query);
  if (page.nextCursor) next.set("cursor", page.nextCursor);
  return (
    <>
      <PageHeader
        title="Request templates"
        description="Draft, preview and publish plain-text letters. Published content stays immutable; individual requests still require user approval."
        actions={
          <Button asChild>
            <Link href="/admin/templates/new">Add template</Link>
          </Button>
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="template-search">Search templates</Label>
          <Input
            id="template-search"
            name="search"
            defaultValue={filters.search ?? ""}
            maxLength={100}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="template-status">Show</Label>
          <select
            id="template-status"
            name="status"
            defaultValue={filters.status ?? "all"}
            className="h-11 rounded-md border border-input bg-background px-3 text-sm md:h-10"
          >
            <option value="all">All templates</option>
            <option value="draft">Has draft</option>
            <option value="published">Active published templates</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <Button type="submit" variant="outline">
          Apply filters
        </Button>
        <Link className="py-2 text-sm underline" href="/admin/templates">
          Reset
        </Link>
      </form>
      <p className="text-sm text-muted-foreground">
        {page.total} matching {page.total === 1 ? "template" : "templates"}. Newest
        entries first.
      </p>
      {page.items.length ? (
        <div
          role="region"
          aria-label="Template administration results"
          tabIndex={0}
          className="min-w-0 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Request type</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Jurisdiction</TableHead>
                <TableHead>Availability</TableHead>
                <TableHead>Latest version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <Link
                      className="inline-block py-2 font-medium underline"
                      href={`/admin/templates/${template.id}`}
                    >
                      {template.name}
                    </Link>
                  </TableCell>
                  <TableCell>{REQUEST_TYPE_LABELS[template.requestType]}</TableCell>
                  <TableCell>
                    {template.channel.toLowerCase().replaceAll("_", " ")}
                  </TableCell>
                  <TableCell>{template.jurisdiction?.code ?? "Generic"}</TableCell>
                  <TableCell>{template.isActive ? "Active" : "Inactive"}</TableCell>
                  <TableCell>
                    {template.versions[0]
                      ? `Version ${template.versions[0].version} · ${template.versions[0].status.toLowerCase()}`
                      : "No version"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="space-y-2 border-t py-6">
          <h2 className="text-lg font-semibold">No matching templates</h2>
          <p className="text-sm">Change the filters or create a draft.</p>
        </div>
      )}
      <nav aria-label="Template result pages" className="flex gap-4 text-sm">
        {filters.cursor ? (
          <Link className="underline" href={`/admin/templates?${query}`}>
            First page
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link className="underline" href={`/admin/templates?${next}`}>
            Next page
          </Link>
        ) : null}
      </nav>
    </>
  );
}
