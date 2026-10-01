import Link from "next/link";
import { notFound } from "next/navigation";
import { EditorForm } from "@/components/admin/editor-form";
import { PageHeader } from "@/components/common/page-header";
import { requireRole } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { getLegalVersionAdministration } from "@/lib/db/repositories/adminLegalRules";
import {
  legalSourceFromVersion,
  prepareLegalSource,
  validateLegalPublication,
  legalSourceUrlSchema,
  legalAdditionalSourcesSchema,
} from "@/lib/jurisdiction/authoring";
import { formatIsoDate, formatUtcStamp } from "@/lib/format/datetime";
import { REQUEST_TYPE_LABELS } from "@/lib/requests/labels";
import {
  saveLegalDraftAction,
  startLegalDraftAction,
  publishLegalRuleAction,
} from "../../../actions";
import { legalSourceFields } from "../../../fields";

export const metadata = { title: "Legal rule version" };
const savedMessages: Record<string, string> = {
  created: "Draft created. Check the sources and save changes before publication.",
  draft: "Draft saved. The preview below uses the saved configuration.",
  published:
    "Version published with its effective schedule. Existing request snapshots retain their approved content and legal version.",
};
export default async function LegalVersionPage({
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
    version = await getLegalVersionAdministration(actor, { legalRuleId: id, versionId });
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const scope = {
    legalRuleId: id,
    versionId,
    expectedUpdatedAt: version.legalRule.updatedAt.toISOString(),
  };
  const source = legalSourceFromVersion(version);
  const primaryLink = legalSourceUrlSchema.safeParse(version.sourceUrl);
  const authorityLink = legalSourceUrlSchema.safeParse(version.escalationUrl);
  const additionalLinks = legalAdditionalSourcesSchema.safeParse(
    version.additionalSources
  );
  let prepared;
  let previewError = "";
  try {
    prepared = prepareLegalSource(source);
  } catch (error) {
    if (!isAppError(error)) throw error;
    previewError = error.message;
  }
  let publicationErrors: string[] = [];
  if (version.status === "DRAFT")
    try {
      validateLegalPublication(source);
    } catch (error) {
      if (!isAppError(error)) throw error;
      publicationErrors = error.details.fieldErrors
        ? Object.values(error.details.fieldErrors as Record<string, string>)
        : [error.message];
    }
  const { saved } = await searchParams;
  const scheduled = version.status === "PUBLISHED" && version.effectiveFrom > new Date();
  return (
    <>
      <PageHeader
        title={version.legalRule.shortName + " · version " + version.version}
        description={
          (scheduled ? "Scheduled" : version.status.toLowerCase()) +
          " · " +
          version.legalRule.jurisdiction.name +
          " · " +
          version.confidence.toLowerCase() +
          " confidence"
        }
      />
      <Link className="text-sm underline" href={"/admin/legal-rules/" + id}>
        Back to legal history
      </Link>
      {saved && savedMessages[saved] ? (
        <p role="status" className="text-sm">
          {savedMessages[saved]}
        </p>
      ) : null}
      {scheduled ? (
        <p className="text-sm">
          Scheduled for {formatUtcStamp(version.effectiveFrom)}. This version is not
          selected before that time.
        </p>
      ) : null}
      {!version.legalRule.isActive && version.status !== "DRAFT" ? (
        <p className="text-sm">
          This rule is inactive. Its history remains available for existing requests.
        </p>
      ) : null}
      <div className="max-w-[680px] space-y-8">
        {version.status === "DRAFT" ? (
          <section className="space-y-4" aria-labelledby="legal-edit">
            <h2 id="legal-edit" className="text-lg font-semibold">
              Edit draft
            </h2>
            <EditorForm
              key={scope.expectedUpdatedAt}
              action={saveLegalDraftAction}
              initialValues={{ ...scope, ...source }}
              fields={legalSourceFields}
              sectionHeadingLevel={3}
              submitLabel="Save legal draft and preview"
            />
          </section>
        ) : (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Create a correction</h2>
            <p className="text-sm">
              Published and retired content cannot be edited. A new draft copies this
              source and needs its own review.
            </p>
            <EditorForm
              action={startLegalDraftAction}
              initialValues={scope}
              fields={[]}
              submitLabel="Start a new legal draft"
            />
          </section>
        )}
        <section
          id="preview"
          aria-labelledby="legal-preview"
          className="space-y-4 border-t pt-6"
        >
          <h2 id="legal-preview" className="text-lg font-semibold">
            Saved synthetic preview
          </h2>
          <p className="text-sm text-muted-foreground">
            The generic letter checks legal-text rendering with synthetic identifiers.
            Review jurisdiction-specific templates separately. No personal records are
            read and no message is sent.
          </p>
          {prepared ? (
            <>
              <p className="text-sm">
                <strong>Receipt example:</strong> 31 January 2026.{" "}
                <strong>Response target:</strong>{" "}
                {formatIsoDate(prepared.timingPreview.deadlineOn)}
                {prepared.timingPreview.deadlineOn
                  ? prepared.timingPreview.deadlineIsEstimate
                    ? " (estimate)"
                    : " (recorded receipt calculation)"
                  : " (no calculated target)"}
                .
              </p>
              <p className="text-sm text-muted-foreground">
                {prepared.timingPreview.deadlineNote}
              </p>
              {prepared.previews.map((preview) => (
                <details key={preview.type}>
                  <summary className="cursor-pointer py-2 text-sm font-medium">
                    {REQUEST_TYPE_LABELS[preview.type]} letter
                  </summary>
                  <p className="mt-3 text-sm font-medium">Subject: {preview.subject}</p>
                  <p className="border-y border-border py-5 text-sm leading-7 [overflow-wrap:anywhere] whitespace-pre-wrap">
                    {preview.body}
                  </p>
                </details>
              ))}
            </>
          ) : (
            <p role="alert" className="text-sm text-destructive">
              {previewError} Edit this draft or start a new draft to repair timing,
              sources or verification configuration before publication.
            </p>
          )}
        </section>
        <section aria-labelledby="legal-sources" className="space-y-4 border-t pt-6">
          <h2 id="legal-sources" className="text-lg font-semibold">
            Saved applicability and sources
          </h2>
          <p className="text-sm whitespace-pre-wrap">{version.riskNotes}</p>
          <p className="text-sm">
            Reviewed on {formatIsoDate(version.lastReviewedAt)} by {version.reviewedBy}.{" "}
            {version.requiresLegalReview
              ? "Legal review required."
              : "No additional legal-review flag is recorded."}
          </p>
          {primaryLink.success ? (
            <a
              href={primaryLink.data}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block py-2 text-sm [overflow-wrap:anywhere] underline"
            >
              {version.sourceTitle}
            </a>
          ) : (
            <p className="text-sm">{version.sourceTitle} · source URL needs review</p>
          )}
          {additionalLinks.success && additionalLinks.data.length ? (
            <ul className="space-y-2 text-sm">
              {additionalLinks.data.map((item, index) => (
                <li key={index}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block py-2 [overflow-wrap:anywhere] underline"
                  >
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-sm">
            Effective from {formatUtcStamp(version.effectiveFrom)}
            {version.effectiveUntil
              ? " until " + formatUtcStamp(version.effectiveUntil)
              : ""}
            .
          </p>
          <p className="text-sm whitespace-pre-wrap">{version.escalationPath}</p>
          {authorityLink.success ? (
            <a
              href={authorityLink.data}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block py-2 text-sm underline"
            >
              {version.escalationAuthority || "Authority or complaint guidance"}
            </a>
          ) : null}
        </section>
        {version.status === "DRAFT" ? (
          <section aria-labelledby="legal-publish" className="space-y-4 border-t pt-6">
            <h2 id="legal-publish" className="text-lg font-semibold">
              Publish reviewed rule
            </h2>
            <p className="text-sm">
              Current publication supersedes earlier applicable versions of this rule.
              Future publication keeps the current version in use until its effective
              time. Individual requests still need user approval.
            </p>
            {!version.legalRule.isActive ? (
              <p className="text-sm">
                This rule is inactive. Publication retires its earlier published versions
                and enables this reviewed version only at its effective time.
              </p>
            ) : null}
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
            ) : prepared ? (
              <EditorForm
                key={scope.expectedUpdatedAt}
                action={publishLegalRuleAction}
                initialValues={{ ...scope, checksum: prepared.checksum, reviewed: "" }}
                fields={[
                  {
                    name: "reviewed",
                    label: "Publication review",
                    kind: "checkboxes",
                    description:
                      "Check primary sources, scope, exceptions, actual review date, effective time, timing and the actual request templates.",
                    options: [
                      {
                        value: "yes",
                        label: "I reviewed this saved legal version and its sources",
                      },
                    ],
                  },
                ]}
                submitLabel="Publish legal version"
              />
            ) : null}
          </section>
        ) : null}
        <details className="border-t py-4">
          <summary className="cursor-pointer py-2 text-sm font-medium">
            Saved configuration and checksum
          </summary>
          {prepared ? (
            <p className="mt-3 font-mono text-xs break-all">
              SHA-256: {prepared.checksum}
            </p>
          ) : null}
          <pre className="mt-4 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">
            {JSON.stringify(source, null, 2)}
          </pre>
        </details>
      </div>
    </>
  );
}
