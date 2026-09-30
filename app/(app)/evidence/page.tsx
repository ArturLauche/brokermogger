import { PaperclipIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EvidenceUploadForm } from "./upload-form";
import { SubmitButton } from "@/components/common/submit-button";
import { REQUEST_STATUS_LABELS } from "@/components/common/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resolveActiveProfileForRequest } from "@/app/_lib/active-profile";
import { requireActorOrRedirect } from "@/lib/auth";
import { listOwnedRequests, getOwnedRequestChoice } from "@/lib/db/repositories/requests";
import { listEvidence } from "@/lib/evidence/service";
import { formatIsoDate } from "@/lib/format/datetime";
import { ListNavigation } from "@/components/common/list-navigation";
import { ListFilters } from "@/components/common/list-filters";
import { ListResultSummary } from "@/components/common/list-result-summary";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { evidenceKindSchema } from "@/lib/validation/enums";

import { deleteEvidenceAction } from "./actions";

export const metadata = { title: "Evidence" };
export const dynamic = "force-dynamic";

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{
    stored?: string;
    error?: string;
    code?: string;
    requestId?: string;
    search?: string;
    kind?: string;
    expiry?: string;
    cursor?: string;
    requestSearch?: string;
    requestCursor?: string;
  }>;
}) {
  const actor = await requireActorOrRedirect();
  const { active } = await resolveActiveProfileForRequest(actor);
  const params = await searchParams;
  const [page, requestPage, selected] = await Promise.all([
    listEvidence(actor, active?.id ?? null, params),
    listOwnedRequests(actor, active?.id ?? null, {
      search: params.requestSearch,
      cursor: params.requestCursor,
    }),
    params.requestId ? getOwnedRequestChoice(actor, params.requestId) : null,
  ]);
  const requests = [
    ...new Map(
      [...(selected ? [selected] : []), ...requestPage.items].map((row) => [row.id, row])
    ).values(),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Evidence"
        description="Screenshots and files attached to your requests."
      />
      {params.stored ? (
        <Alert role="status">
          <AlertTitle>File stored.</AlertTitle>
        </Alert>
      ) : null}
      {params.error ? (
        <Alert variant="destructive">
          <AlertTitle>
            {params.error === "delete"
              ? "File removal is pending"
              : "The file could not be stored"}
          </AlertTitle>
          <AlertDescription>
            {params.error === "delete"
              ? params.code === "STORAGE_FAILED"
                ? "The file is blocked from further downloads. Removal is pending and cleanup will retry."
                : "Reload the file list and try again."
              : "Choose a PNG, JPEG, or PDF up to 8 MB. Identity documents require a recorded verification request and consent."}
            {params.code ? (
              <>
                {" "}
                Error code: <code>{params.code}</code>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <ListFilters
        path="/evidence"
        prefix="evidence"
        searchLabel="Broker name or masked filename"
        values={params}
        hidden={{
          requestId: params.requestId,
          requestSearch: params.requestSearch,
          requestCursor: params.requestCursor,
        }}
        selects={[
          {
            name: "kind",
            label: "File kind",
            options: [
              { value: "all", label: "All kinds" },
              ...evidenceKindSchema.options.map((value) => ({
                value,
                label: value.toLowerCase().replaceAll("_", " "),
              })),
            ],
          },
          {
            name: "expiry",
            label: "Availability",
            options: [
              { value: "all", label: "All stored files" },
              { value: "available", label: "Available" },
              { value: "expired", label: "Expired" },
            ],
          },
        ]}
      />
      <ListResultSummary shown={page.items.length} total={page.total} noun="file" />
      {page.items.length === 0 ? (
        <EmptyState
          icon={PaperclipIcon}
          title={
            params.search ||
            (params.kind && params.kind !== "all") ||
            (params.expiry && params.expiry !== "all") ||
            params.cursor
              ? "No matching files"
              : "No files stored"
          }
          description="Upload a screenshot of a broker page or a PDF reply. Do not upload identity documents unless asked."
        />
      ) : (
        <Table scrollLabel="Stored evidence">
          <TableHeader>
            <TableRow>
              <TableHead>Kind</TableHead>
              <TableHead>Request</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((file) => (
              <TableRow key={file.id}>
                <TableCell>{file.kind.replaceAll("_", " ").toLowerCase()}</TableCell>
                <TableCell>
                  {file.removalRequest ? (
                    <Link
                      className="underline"
                      href={`/requests/${file.removalRequest.id}`}
                    >
                      {file.removalRequest.broker.legalName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell>{formatIsoDate(file.createdAt)}</TableCell>
                <TableCell>{formatIsoDate(file.expiresAt)}</TableCell>
                <TableCell>{Math.ceil(file.byteSize / 1024)} KB</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {file.expiresAt && file.expiresAt <= new Date() ? (
                      <span className="inline-flex min-h-11 items-center text-sm text-muted-foreground">
                        Expired · download unavailable
                      </span>
                    ) : (
                      <Button asChild variant="outline" size="sm">
                        <a href={`/api/evidence/${file.id}/download`}>Download</a>
                      </Button>
                    )}
                    <form action={deleteEvidenceAction}>
                      <input type="hidden" name="evidenceId" value={file.id} />
                      <SubmitButton variant="ghost" size="sm" pendingText="Deleting…">
                        Delete
                      </SubmitButton>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <ListNavigation
        path="/evidence"
        filters={{
          search: params.search,
          kind: params.kind,
          expiry: params.expiry,
          requestId: params.requestId,
          requestSearch: params.requestSearch,
          requestCursor: params.requestCursor,
        }}
        cursor={params.cursor}
        nextCursor={page.nextCursor}
        label="Evidence results"
      />

      <section className="space-y-5 border-t pt-6" aria-labelledby="upload-heading">
        <h2 id="upload-heading" className="text-lg font-semibold">
          Upload evidence
        </h2>
        <p className="text-sm text-muted-foreground">
          Find the request before selecting a file. All requests are available through
          search and pages; the selected request stays in the upload choices.
        </p>
        <form
          method="get"
          action="/evidence"
          className="flex max-w-[680px] flex-wrap items-end gap-3"
        >
          {(["search", "kind", "expiry", "cursor", "requestId"] as const).map((key) =>
            params[key] ? (
              <input key={key} type="hidden" name={key} value={params[key]} />
            ) : null
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="upload-request-search">
              Find a request by broker name or reference
            </Label>
            <Input
              id="upload-request-search"
              name="requestSearch"
              type="search"
              maxLength={100}
              defaultValue={params.requestSearch ?? ""}
            />
          </div>
          <Button type="submit" variant="outline">
            Find requests
          </Button>
        </form>
        <ListResultSummary
          shown={requestPage.items.length}
          total={requestPage.total}
          noun="request"
        />
        <ListNavigation
          path="/evidence"
          filters={{
            search: params.search,
            kind: params.kind,
            expiry: params.expiry,
            cursor: params.cursor,
            requestId: params.requestId,
            requestSearch: params.requestSearch,
          }}
          cursor={params.requestCursor}
          cursorName="requestCursor"
          nextCursor={requestPage.nextCursor}
          label="Upload request choices"
        />
        <EvidenceUploadForm
          key={`${params.requestCursor ?? ""}:${params.requestSearch ?? ""}:${params.requestId ?? ""}`}
          requestId={selected?.id ?? ""}
          requests={requests.map((request) => ({
            id: request.id,
            label: `${request.broker.legalName} · ${REQUEST_STATUS_LABELS[request.status]}`,
          }))}
        />
      </section>
    </div>
  );
}
