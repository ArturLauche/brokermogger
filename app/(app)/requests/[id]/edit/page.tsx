import Link from "next/link";
import { notFound } from "next/navigation";
import { isAppError } from "@/lib/core/errors";
import { Button } from "@/components/ui/button";
import { returnToDraftAction } from "../../actions";
import { PageHeader } from "@/components/common/page-header";
import { requireActorOrRedirect } from "@/lib/auth";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { requirePermission } from "@/lib/permissions/policy";
import { canTransition } from "@/lib/requests/stateMachine";
import { DraftForm } from "./draft-form";

export const metadata = { title: "Edit request draft" };

export default async function EditDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireActorOrRedirect();
  const request = await getOwnedRequest(actor, (await params).id).catch((error) => {
    if (isAppError(error) && ["NOT_FOUND", "FORBIDDEN"].includes(error.code)) notFound();
    throw error;
  });
  requirePermission(actor, "request:update", { ownerUserId: request.userId });
  const snapshot = request.snapshots[0];
  const editable =
    (request.status === "DRAFT" || canTransition(request.status, "DRAFT", "USER")) &&
    !request.outboundEmails.length &&
    !request.manualSubmissions.some((row) => row.snapshotId === snapshot?.id);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Edit request draft"
        description={`${request.broker.legalName} · Saving changes requires fresh review and approval.`}
      />
      {!editable ? (
        <p className="text-sm leading-6 text-muted-foreground">
          This message is in progress, has been submitted, or the request is closed.
          Return to its history for the available next actions.
        </p>
      ) : request.status === "APPROVED" ? (
        <form action={returnToDraftAction} className="space-y-4">
          <input name="requestId" type="hidden" value={request.id} />
          <p>
            Approval is still active. Withdraw it before editing. If dispatch has already
            started, its outcome must be checked first.
          </p>
          <Button>Withdraw approval and edit</Button>
        </form>
      ) : snapshot ? (
        <DraftForm
          initial={{
            requestId: request.id,
            previousSnapshotId: snapshot.id,
            subject: snapshot.subject,
            body: snapshot.body,
          }}
          canRegenerate
        />
      ) : (
        <p>This request has no snapshot. Return to the request and create a new draft.</p>
      )}
      <Link
        href={`/requests/${request.id}`}
        className="text-sm underline underline-offset-4"
      >
        Back to request
      </Link>
    </div>
  );
}
