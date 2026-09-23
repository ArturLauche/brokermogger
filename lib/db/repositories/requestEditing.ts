import { AppError } from "@/lib/core/errors";
import { prisma } from "@/lib/db/client";
import type { ActorContext } from "@/lib/permissions/actor";
import {
  identifierDigest,
  readApprovalEnvelope,
  profileIdentityDigest,
} from "@/lib/requests/envelope";
import { canTransition } from "@/lib/requests/stateMachine";
import type { PreparedDraft } from "./requestGeneration";
import { assertCurrentProfileConsent, loadRequestForDecision } from "./requestDecision";
import { applyRequestStatusInTx, insertSnapshot, type SnapshotInput } from "./requests";

export async function reopenRequestDraft(actor: ActorContext, requestId: string) {
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(tx, actor, requestId, "request:update");
    if (request.status === "DRAFT") return { requestId };
    if (
      await tx.outboundEmail.count({
        where: {
          removalRequestId: request.id,
          dispatchState: { in: ["DISPATCHING", "AMBIGUOUS", "RECONCILIATION_REQUIRED"] },
        },
      })
    )
      throw new AppError({
        code: "CONFLICT",
        message:
          "Dispatch has started or its outcome is uncertain. Check that outcome before preparing another message.",
      });
    await applyRequestStatusInTx(tx, {
      requestId,
      from: request.status,
      to: "DRAFT",
      actor: "USER",
      actorUserId: actor.userId,
      message: "Approval withdrawn for editing before dispatch.",
      cancelPendingJobTypes: ["SEND_REQUEST"],
    });
    return { requestId };
  });
}

export async function replaceRequestDraft(
  actor: ActorContext,
  input: {
    requestId: string;
    previousSnapshotId: string;
    subject: string;
    body: string;
    regenerated?: PreparedDraft;
    regeneratedSnapshot?: Omit<
      SnapshotInput,
      "version" | "removalRequestId" | "createdByUserId"
    >;
  }
) {
  return prisma.$transaction(
    async (tx) => {
      const request = await loadRequestForDecision(
        tx,
        actor,
        input.requestId,
        "request:update"
      );
      assertCurrentProfileConsent(request.profile);
      if (request.currentSnapshotId !== input.previousSnapshotId)
        throw new AppError({
          code: "CONFLICT",
          message: "A newer draft exists. Reload before saving changes.",
        });
      if (request.status !== "DRAFT" && !canTransition(request.status, "DRAFT", "USER"))
        throw new AppError({
          code: "CONFLICT",
          message:
            "This request is already in progress. Prepare a follow-up from its timeline.",
        });
      const unresolved = await tx.outboundEmail.count({
        where: {
          removalRequestId: request.id,
          dispatchState: { in: ["DISPATCHING", "AMBIGUOUS", "RECONCILIATION_REQUIRED"] },
        },
      });
      if (unresolved)
        throw new AppError({
          code: "CONFLICT",
          message:
            "A previous send has an uncertain outcome. Resolve it before preparing another message.",
        });
      if (request.status === "NEEDS_USER_ACTION" && request.sentAt)
        throw new AppError({
          code: "CONFLICT",
          message:
            "Record the broker response or prepare a follow-up; this request has already been submitted.",
        });
      const previous = await tx.requestSnapshot.findUniqueOrThrow({
        where: { id: input.previousSnapshotId },
      });
      const draft = input.regenerated;
      const freshSnapshot = draft?.snapshot ?? input.regeneratedSnapshot;
      if (
        draft &&
        (draft.profileId !== request.profileId ||
          draft.brokerId !== request.brokerId ||
          draft.requestType !== request.requestType)
      )
        throw new AppError({
          code: "CONFLICT",
          message: "The regenerated draft does not match this request.",
        });
      const selectedIds = draft?.includedIdentifierIds ?? request.includedIdentifierIds;
      const identifiers = await tx.profileIdentifier.findMany({
        where: { profileId: request.profileId, id: { in: selectedIds }, deletedAt: null },
        select: { id: true, valueBi: true },
      });
      if (identifiers.length !== selectedIds.length || identifiers.length === 0)
        throw new AppError({
          code: "CONFLICT",
          message: "Select valid identifiers before regenerating this draft.",
        });
      if (!freshSnapshot && previous.identifierDigest !== identifierDigest(identifiers))
        throw new AppError({
          code: "CONFLICT",
          message:
            "The selected identifiers changed. Regenerate the draft before editing it.",
        });
      if (
        !freshSnapshot &&
        readApprovalEnvelope(previous).profileDigest !==
          profileIdentityDigest(request.profile)
      )
        throw new AppError({
          code: "CONFLICT",
          message:
            "Profile details changed. Regenerate the draft before editing its text.",
        });
      if (request.status !== "DRAFT")
        await applyRequestStatusInTx(tx, {
          requestId: request.id,
          from: request.status,
          to: "DRAFT",
          actor: "USER",
          actorUserId: actor.userId,
          message:
            "The account holder reopened the draft. Previous approval no longer authorizes sending.",
          cancelPendingJobTypes: ["SEND_REQUEST"],
        });
      if (draft)
        await tx.removalRequest.update({
          where: { id: request.id },
          data: {
            jurisdictionId: draft.jurisdictionId,
            channel: draft.channel,
            destinationType: draft.destinationType,
            destinationValue: draft.destinationValue,
            legalRuleVersionId: draft.legalRuleVersionId,
            templateVersionId: draft.templateVersionId,
            legalBasisText: draft.legalBasisText,
            deadlineDays: draft.deadlineDays,
            includedIdentifierIds: selectedIds,
            includedIdentifiers: draft.includedIdentifiers,
          },
        });
      if (input.regeneratedSnapshot)
        await tx.removalRequest.update({
          where: { id: request.id },
          data: { templateVersionId: input.regeneratedSnapshot.templateVersionId },
        });
      if (
        freshSnapshot &&
        freshSnapshot.identifierDigest !== identifierDigest(identifiers)
      )
        throw new AppError({
          code: "CONFLICT",
          message: "Identifiers changed during regeneration. Try again.",
        });
      const snapshot = await insertSnapshot(
        {
          removalRequestId: request.id,
          version: previous.version + 1,
          subject: input.subject,
          body: input.body,
          templateVersionId:
            freshSnapshot?.templateVersionId ?? request.templateVersionId,
          legalRuleVersionId:
            freshSnapshot?.legalRuleVersionId ?? request.legalRuleVersionId,
          variables: freshSnapshot?.variables ?? {
            followUpNumber: String(request.followUpCount),
          },
          identifierDigest: identifierDigest(identifiers),
          profileDigest:
            freshSnapshot?.profileDigest ?? profileIdentityDigest(request.profile),
          createdByUserId: actor.userId,
        },
        tx
      );
      const reasons = draft?.manualReviewReasons ?? [
        ...new Set([
          ...request.manualReviewReasons,
          "The message includes text edited by the account holder.",
        ]),
      ];
      await tx.removalRequest.update({
        where: { id: request.id },
        data: {
          currentSnapshotId: snapshot.id,
          manualReviewRequired: reasons.length > 0,
          manualReviewReasons: reasons,
          manualReviewResolvedAt: null,
          manualReviewResolvedBy: null,
          approvedSnapshotId: null,
          approvedEnvelopeHash: null,
          approvalConsentRecordId: null,
        },
      });
      await applyRequestStatusInTx(tx, {
        requestId: request.id,
        from: "DRAFT",
        to: "PREPARED",
        actor: "USER",
        actorUserId: actor.userId,
        message: draft
          ? "Draft regenerated with current profile and catalogue information."
          : "Edited text saved as a new immutable snapshot.",
      });
      await applyRequestStatusInTx(tx, {
        requestId: request.id,
        from: "PREPARED",
        to: reasons.length ? "MANUAL_REVIEW_REQUIRED" : "AWAITING_USER_APPROVAL",
        actor: "USER",
        actorUserId: actor.userId,
        message: "Review and approve this complete message before submission.",
      });
      return { requestId: request.id, snapshotId: snapshot.id };
    },
    { timeout: 15_000 }
  );
}
