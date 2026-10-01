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
import { getTemplateAdministration } from "@/lib/db/repositories/adminTemplates";
import { REQUEST_TYPE_LABELS } from "@/lib/requests/labels";
import { updateTemplateAction, deactivateTemplateAction } from "../actions";
import { templateMetadataFields } from "../fields";

export const metadata = { title: "Request template history" };
export default async function TemplateHistoryPage({
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
    result = await getTemplateAdministration(actor, {
      templateId: (await params).id,
      cursor: filters.cursor,
    });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const { template, versions } = result;
  const scope = {
    templateId: template.id,
    expectedUpdatedAt: template.updatedAt.toISOString(),
  };
  return (
    <>
      <PageHeader
        title={template.name}
        description={`${REQUEST_TYPE_LABELS[template.requestType]} · ${template.channel.toLowerCase().replaceAll("_", " ")} · ${template.jurisdiction?.name ?? "Generic"}`}
      />
      <Link href="/admin/templates" className="text-sm underline">
        Back to templates
      </Link>
      {filters.saved === "details" ? (
        <p role="status" className="text-sm">
          Template details saved.
        </p>
      ) : null}
      {filters.saved === "inactive" ? (
        <p role="status" className="text-sm">
          Template deactivated. Existing snapshots and history are preserved.
        </p>
      ) : null}
      <div className="max-w-[680px] space-y-8">
        <section className="space-y-4" aria-labelledby="template-details">
          <h2 id="template-details" className="text-lg font-semibold">
            Template details
          </h2>
          <p className="text-sm text-muted-foreground">
            Stable key: <code>{template.key}</code>. The request type, channel and
            jurisdiction are fixed; create a separate template to change the scope.
          </p>
          <EditorForm
            key={scope.expectedUpdatedAt}
            action={updateTemplateAction}
            initialValues={{
              ...scope,
              name: template.name,
              description: template.description ?? "",
            }}
            fields={templateMetadataFields}
          />
        </section>
        <section
          className="space-y-4 border-t pt-6"
          aria-labelledby="template-availability"
        >
          <h2 id="template-availability" className="text-lg font-semibold">
            Availability
          </h2>
          <p className="text-sm">
            {template.isActive
              ? "Active. Its published version can be selected for new requests."
              : "Inactive. Publish a reviewed draft to make this template available."}
          </p>
          {template.isActive ? (
            <EditorForm
              key={scope.expectedUpdatedAt}
              action={deactivateTemplateAction}
              initialValues={scope}
              fields={[]}
              submitLabel="Deactivate template"
            />
          ) : null}
        </section>
      </div>
      <section className="space-y-4 border-t pt-6" aria-labelledby="template-history">
        <h2 id="template-history" className="text-lg font-semibold">
          Version history
        </h2>
        <p className="text-sm text-muted-foreground">
          Open a version to preview it, edit a draft, or start a new draft. Published text
          stays immutable.
        </p>
        {versions.items.length ? (
          <div
            role="region"
            aria-label="Template version history"
            tabIndex={0}
            className="min-w-0 overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Table scrollLabel="Template versions">
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Review notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.items.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell>
                      <Link
                        className="inline-block py-2 font-medium underline"
                        href={`/admin/templates/${template.id}/versions/${version.id}`}
                      >
                        Version {version.version}
                      </Link>
                    </TableCell>
                    <TableCell>{version.status.toLowerCase()}</TableCell>
                    <TableCell>{version.locale}</TableCell>
                    <TableCell className="max-w-sm whitespace-normal">
                      {version.changeNotes || "No review notes yet"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p>No versions yet.</p>
        )}
        <nav aria-label="Template history pages" className="flex gap-4 text-sm">
          {filters.cursor ? (
            <Link className="underline" href={`/admin/templates/${template.id}`}>
              First page
            </Link>
          ) : null}
          {versions.nextCursor ? (
            <Link
              className="underline"
              href={`/admin/templates/${template.id}?${new URLSearchParams({ cursor: versions.nextCursor })}`}
            >
              Next page
            </Link>
          ) : null}
        </nav>
      </section>
    </>
  );
}
