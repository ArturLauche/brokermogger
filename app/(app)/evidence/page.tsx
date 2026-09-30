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
import { listOwnedRequests } from "@/lib/db/repositories/requests";
import { listEvidence } from "@/lib/evidence/service";
import { formatIsoDate } from "@/lib/format/datetime";

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
  }>;
}) {
  const actor = await requireActorOrRedirect();
  const { active } = await resolveActiveProfileForRequest(actor);
  const files = await listEvidence(actor, active?.id ?? null);
  const requests = await listOwnedRequests(actor, active?.id ?? null);
  const params = await searchParams;

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

      {files.length === 0 ? (
        <EmptyState
          icon={PaperclipIcon}
          title="No files stored"
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
            {files.map((file) => (
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
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/evidence/${file.id}/download`}>Download</a>
                    </Button>
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

      <section className="space-y-5 border-t pt-6" aria-labelledby="upload-heading">
        <h2 id="upload-heading" className="text-lg font-semibold">
          Upload evidence
        </h2>
        <EvidenceUploadForm
          requestId={
            requests.some((request) => request.id === params.requestId)
              ? params.requestId!
              : ""
          }
          requests={requests.map((request) => ({
            id: request.id,
            label: `${request.broker.legalName} · ${REQUEST_STATUS_LABELS[request.status]}`,
          }))}
        />
      </section>
    </div>
  );
}
