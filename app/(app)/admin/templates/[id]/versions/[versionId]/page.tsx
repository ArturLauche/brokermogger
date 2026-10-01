import Link from "next/link";
import { notFound } from "next/navigation";
import { EditorForm } from "@/components/admin/editor-form";
import { TemplateReference } from "@/components/admin/template-reference";
import { PageHeader } from "@/components/common/page-header";
import { requireRole } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { getTemplateVersionAdministration } from "@/lib/db/repositories/adminTemplates";
import {
  prepareTemplateSource,
  validateTemplatePublication,
} from "@/lib/templates/authoring";
import {
  saveDraftAction,
  startDraftAction,
  publishTemplateAction,
} from "../../../actions";
import { templateSourceFields } from "../../../fields";

export const metadata = { title: "Request template version" };
const savedMessages: Record<string, string> = {
  created: "Draft created. Review the text and save any changes before publication.",
  draft: "Draft saved. The preview below uses the saved text.",
  published:
    "Version published for future requests. Existing request snapshots keep their approved content.",
};
export default async function TemplateVersionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; versionId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const actor = await requireRole("MAINTAINER");
  const { id, versionId } = await params;
  let version;
  try {
    version = await getTemplateVersionAdministration(actor, {
      templateId: id,
      versionId,
    });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const { saved } = await searchParams;
  const scope = {
    templateId: id,
    versionId,
    expectedUpdatedAt: version.template.updatedAt.toISOString(),
  };
  let prepared;
  let previewError = "";
  try {
    prepared = prepareTemplateSource(version);
  } catch (error) {
    if (!isAppError(error)) throw error;
    previewError = error.message;
  }
  let publicationErrors: string[] = [];
  if (version.status === "DRAFT") {
    try {
      validateTemplatePublication(version);
    } catch (error) {
      if (!isAppError(error)) throw error;
      publicationErrors = error.details.fieldErrors
        ? Object.values(error.details.fieldErrors as Record<string, string>)
        : [error.message];
    }
  }
  return (
    <>
      <PageHeader
        title={`${version.template.name} · version ${version.version}`}
        description={`${version.status.toLowerCase()} · ${version.template.jurisdiction?.name ?? "Generic"} · ${version.template.channel.toLowerCase().replaceAll("_", " ")}`}
      />
      <Link className="text-sm underline" href={`/admin/templates/${id}`}>
        Back to template history
      </Link>
      {saved && savedMessages[saved] ? (
        <p role="status" className="text-sm">
          {savedMessages[saved]}
        </p>
      ) : null}
      {!version.template.isActive && version.status !== "DRAFT" ? (
        <p className="text-sm">
          This template is inactive. Its published text is retained for historical
          requests.
        </p>
      ) : null}
      <div className="max-w-[680px] space-y-8">
        {version.status === "DRAFT" ? (
          <section aria-labelledby="edit-template" className="space-y-4">
            <h2 id="edit-template" className="text-lg font-semibold">
              Edit draft
            </h2>
            <EditorForm
              key={`${version.id}:${scope.expectedUpdatedAt}`}
              action={saveDraftAction}
              initialValues={{
                ...scope,
                subjectTemplate: version.subjectTemplate,
                bodyTemplate: version.bodyTemplate,
                locale: version.locale,
                changeNotes: version.changeNotes,
              }}
              fields={templateSourceFields}
              submitLabel="Save draft and preview"
            />
          </section>
        ) : (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Create a new version</h2>
            <p className="text-sm">
              Published and retired text cannot be edited. A new draft copies this version
              and needs its own review.
            </p>
            <EditorForm
              action={startDraftAction}
              initialValues={scope}
              fields={[]}
              submitLabel="Start a new draft"
            />
          </section>
        )}
        <section
          id="preview"
          aria-labelledby="template-preview"
          className="space-y-4 border-t pt-6"
        >
          <h2 id="template-preview" className="text-lg font-semibold">
            Saved preview
          </h2>
          <p className="text-sm text-muted-foreground">
            Synthetic examples only. This preview never reads personal records and does
            not send a message. Edits above appear here after saving.
          </p>
          {prepared ? (
            <>
              <p className="text-sm font-medium">
                Subject: {prepared.selfPreview.subject}
              </p>
              <div className="border-y border-border py-5">
                <p className="text-sm leading-7 [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {prepared.selfPreview.body}
                </p>
              </div>
              <details>
                <summary className="cursor-pointer py-2 text-sm font-medium">
                  Preview with household consent
                </summary>
                <p className="mt-3 text-sm leading-7 [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {prepared.preview.body}
                </p>
              </details>
            </>
          ) : (
            <p role="alert" className="text-sm text-destructive">
              {previewError} Edit this draft or start a new draft to repair the source.
            </p>
          )}
        </section>
        {version.status === "DRAFT" ? (
          <section className="space-y-4 border-t pt-6" aria-labelledby="publish-template">
            <h2 id="publish-template" className="text-lg font-semibold">
              Publish reviewed text
            </h2>
            <p className="text-sm">
              Publication replaces active templates with the same request type, channel
              and jurisdiction. Previous versions remain available in history. New
              requests still require individual user approval.
            </p>
            {publicationErrors.length ? (
              <div className="space-y-2 text-sm">
                <p className="font-medium">
                  Before publishing, fix these items and save the draft:
                </p>
                <ul className="list-disc space-y-2 pl-5">
                  {publicationErrors.map((message, index) => (
                    <li key={index}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <EditorForm
                key={scope.expectedUpdatedAt}
                action={publishTemplateAction}
                initialValues={{ ...scope, checksum: version.checksum, reviewed: "" }}
                fields={[
                  {
                    name: "reviewed",
                    label: "Publication review",
                    kind: "checkboxes",
                    description:
                      "Check the saved self and household previews, applicability, sources and manual-channel instructions.",
                    options: [
                      {
                        value: "yes",
                        label: "I reviewed this saved version and its previews",
                      },
                    ],
                  },
                ]}
                submitLabel="Publish this version"
              />
            )}
          </section>
        ) : null}
        <TemplateReference />
        <details className="border-t py-4">
          <summary className="cursor-pointer py-2 text-sm font-medium">
            Saved source and checksum
          </summary>
          <p className="mt-3 font-mono text-xs break-all">SHA-256: {version.checksum}</p>
          <pre className="mt-4 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">
            {version.subjectTemplate}
            {"\n\n"}
            {version.bodyTemplate}
          </pre>
        </details>
      </div>
    </>
  );
}
