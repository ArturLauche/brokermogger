import { z } from "zod";
import { recordAudit } from "@/lib/audit/service";
import { AppError } from "@/lib/core/errors";
import { replaceRequestDraft } from "@/lib/db/repositories/requestEditing";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { assertSafeBody } from "@/lib/email/validate";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { sanitiseHeaderValue } from "@/lib/security/sanitize";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { renderFollowUpSnapshot } from "./followUp";
import { prepareRequestDrafts } from "./generation";

const editSchema = z.object({
  requestId: entityIdSchema,
  previousSnapshotId: entityIdSchema,
  subject: z.string().trim().min(1).max(200),
  body: z.string().min(1).max(100_000),
});

export async function editRequestDraft(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(editSchema, raw);
  const result = await replaceRequestDraft(actor, {
    ...input,
    subject: sanitiseHeaderValue(input.subject, "subject"),
    body: assertSafeBody(input.body, "body"),
  });
  await recordAudit({
    actor,
    action: "request.rendered",
    resourceType: "removal_request",
    resourceId: result.requestId,
    metadata: { snapshotId: result.snapshotId, edited: true },
  });
  return result;
}

export async function regenerateRequestDraft(
  actor: ActorContext,
  requestId: string,
  previousSnapshotId: string
) {
  const input = parseWithSchema(
    z.object({ requestId: entityIdSchema, previousSnapshotId: entityIdSchema }),
    { requestId, previousSnapshotId }
  );
  const request = await getOwnedRequest(actor, input.requestId);
  requirePermission(actor, "request:update", { ownerUserId: request.userId });
  if (request.followUpCount > 0) {
    const regeneratedSnapshot = await renderFollowUpSnapshot(
      actor,
      request,
      request.followUpCount,
      request.templateVersion?.template.requestType === "FINAL_REMINDER"
        ? "FINAL_REMINDER"
        : "FOLLOW_UP"
    );
    return replaceRequestDraft(actor, {
      ...input,
      subject: regeneratedSnapshot.subject,
      body: regeneratedSnapshot.body,
      regeneratedSnapshot,
    });
  }
  const {
    drafts: [draft],
  } = await prepareRequestDrafts(
    actor,
    {
      profileId: request.profileId,
      brokerIds: [request.brokerId],
      requestType: request.requestType,
      identifierIds: request.includedIdentifierIds,
    },
    { id: request.id, reference: request.externalReference }
  );
  if (!draft)
    throw new AppError({
      code: "CONFLICT",
      message: "The request could not be regenerated.",
    });
  const result = await replaceRequestDraft(actor, {
    ...input,
    subject: draft.snapshot.subject,
    body: draft.snapshot.body,
    regenerated: draft,
  });
  await recordAudit({
    actor,
    action: "request.rendered",
    resourceType: "removal_request",
    resourceId: result.requestId,
    metadata: { snapshotId: result.snapshotId, regenerated: true },
  });
  return result;
}
