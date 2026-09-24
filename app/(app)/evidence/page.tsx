import { PaperclipIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

import { deleteEvidenceAction, uploadEvidenceAction } from "./actions";

export const metadata = { title: "Evidence" };
export const dynamic = "force-dynamic";

export default async function EvidencePage({
  searchParams,
}: {
  searchParams: Promise<{ stored?: string; error?: string; requestId?: string }>;
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
      <Alert>
        <AlertTitle>Identity documents</AlertTitle>
        <AlertDescription>
          Temporary, encrypted, and auto-deleted. Only attach an identity document when a
          specific request asked for it.
        </AlertDescription>
      </Alert>
      {params.stored ? (
        <Alert>
          <AlertTitle>File stored.</AlertTitle>
        </Alert>
      ) : null}
      {params.error ? (
        <Alert variant="destructive">
          <AlertTitle>The file could not be stored</AlertTitle>
          <AlertDescription>
            Allowed types are PNG, JPEG and PDF, up to 8 MB. Identity documents need a
            request that asked for them.
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
        <Table>
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
                <TableCell className="flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/api/evidence/${file.id}/download`}>Download</Link>
                  </Button>
                  <form action={deleteEvidenceAction}>
                    <input type="hidden" name="evidenceId" value={file.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Delete
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <form
        action={uploadEvidenceAction}
        className="flex max-w-xl flex-col gap-3 rounded-xl border p-4"
      >
        <h2 className="font-heading text-base font-medium">Upload</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kind">Kind</Label>
          <select
            id="kind"
            name="kind"
            className="h-9 rounded-lg border border-input px-2"
          >
            <option value="SCREENSHOT">Screenshot</option>
            <option value="BROKER_RESPONSE">Broker response</option>
            <option value="IDENTITY_DOCUMENT">Identity document</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="requestId">Request</Label>
          <select
            id="requestId"
            name="requestId"
            defaultValue={
              requests.some((request) => request.id === params.requestId)
                ? params.requestId
                : ""
            }
            className="h-9 rounded-lg border border-input px-2"
          >
            <option value="">None</option>
            {requests.map((request) => (
              <option key={request.id} value={request.id}>
                {request.broker.legalName} — {request.status}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="file">File</Label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept="image/png,image/jpeg,application/pdf"
          />
          <p className="text-sm text-muted-foreground">
            Redact identity documents before upload. Max 8 MB. PNG, JPEG or PDF.
          </p>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="identityConsent" className="mt-1 size-4" />
          <span>
            For an optional identity document: I consent to temporary encrypted storage
            after a recorded broker verification request. I will handle any external
            submission myself.
          </span>
        </label>
        <Button type="submit">Store file</Button>
      </form>
    </div>
  );
}
