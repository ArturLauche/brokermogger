import { AppError } from "@/lib/core/errors";
import { prisma } from "@/lib/db/client";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { canPrepareEscalation } from "@/lib/requests/escalationEligibility";
import { canTransition } from "@/lib/requests/stateMachine";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { assertCurrentProfileConsent, loadRequestForDecision } from "./requestDecision";
import { applyRequestStatusInTx } from "./requests";

export async function prepareEscalationRecord(actor: ActorContext, rawId: string) {
  const id = parseWithSchema(entityIdSchema, rawId);
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(tx, actor, id, "request:update");
    assertCurrentProfileConsent(request.profile);
    if (!canPrepareEscalation(request))
      throw new AppError({
        code: "CONFLICT",
        message:
          "Record a rejection, partial completion or an overdue submitted request before preparing escalation guidance.",
      });
    if (
      await tx.outboundEmail.count({
        where: {
          removalRequestId: id,
          dispatchState: { in: ["DISPATCHING", "AMBIGUOUS", "RECONCILIATION_REQUIRED"] },
        },
      })
    )
      throw new AppError({
        code: "CONFLICT",
        message: "Resolve the delivery outcome before preparing an escalation summary.",
      });
    if (request.status === "ESCALATION_RECOMMENDED") return { requestId: id };
    let from = request.status;
    if (!canTransition(from, "ESCALATION_RECOMMENDED", "USER")) {
      await applyRequestStatusInTx(tx, {
        requestId: id,
        from,
        to: "NO_RESPONSE",
        actor: "SYSTEM",
        actorUserId: null,
        message:
          "The recorded response date passed without a confirmed outcome. This can be an estimate; it is not a finding of a legal violation.",
      });
      from = "NO_RESPONSE";
    }
    await applyRequestStatusInTx(tx, {
      requestId: id,
      from,
      to: "ESCALATION_RECOMMENDED",
      actor: "USER",
      actorUserId: actor.userId,
      message:
        "The account holder prepared an escalation summary. No authority has been contacted and no complaint has been filed by Brokermogger.",
      cancelPendingJobTypes: ["PREPARE_FOLLOW_UP", "RECHECK_REMINDER", "SEND_REQUEST"],
    });
    await tx.removalRequest.update({
      where: { id },
      data: {
        nextFollowUpAt: null,
        approvedSnapshotId: null,
        approvedEnvelopeHash: null,
        approvalConsentRecordId: null,
      },
    });
    return { requestId: id };
  });
}

/** Owner-only, minimized preparation data. No identifier, letter or reply plaintext. */
export async function getEscalationSummary(actor: ActorContext, rawId: string) {
  const id = parseWithSchema(entityIdSchema, rawId);
  return prisma.$transaction(async (tx) => {
    const request = await loadRequestForDecision(tx, actor, id, "request:update");
    requirePermission(actor, "evidence:download", { ownerUserId: request.userId });
    if (request.status !== "ESCALATION_RECOMMENDED")
      throw new AppError({
        code: "CONFLICT",
        message: "Prepare the escalation summary from the request first.",
      });
    const [
      rule,
      originalStatus,
      replies,
      submissions,
      snapshots,
      files,
      realEmails,
      simulatedEmails,
    ] = await Promise.all([
      request.legalRuleVersionId
        ? tx.legalRuleVersion.findUnique({
            where: { id: request.legalRuleVersionId },
            select: {
              version: true,
              sourceUrl: true,
              sourceTitle: true,
              escalationAuthority: true,
              escalationPath: true,
              escalationUrl: true,
              confidence: true,
              requiresLegalReview: true,
              lastReviewedAt: true,
            },
          })
        : null,
      tx.removalRequestEvent.findFirst({
        where: { removalRequestId: id, toStatus: "ESCALATION_RECOMMENDED" },
        orderBy: { createdAt: "desc" },
        select: { fromStatus: true },
      }),
      tx.brokerResponse.groupBy({
        by: ["classification"],
        where: { removalRequestId: id, deletedAt: null, confirmedAt: { not: null } },
        _count: { _all: true },
      }),
      tx.manualSubmission.aggregate({
        where: { removalRequestId: id },
        _count: { _all: true },
        _min: { submittedOn: true, receivedOn: true },
        _max: { submittedOn: true },
      }),
      tx.requestSnapshot.count({ where: { removalRequestId: id, erasedAt: null } }),
      tx.evidenceFile.count({
        where: {
          removalRequestId: id,
          deletedAt: null,
          storageState: "READY",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      tx.outboundEmail.count({
        where: { removalRequestId: id, dispatchState: "ACCEPTED", provider: "RESEND" },
      }),
      tx.outboundEmail.count({
        where: {
          removalRequestId: id,
          dispatchState: "ACCEPTED",
          provider: { in: ["MOCK", "SANDBOX"] },
        },
      }),
    ]);
    return {
      requestId: id,
      reference: request.externalReference,
      brokerName: request.broker.legalName,
      requestType: request.requestType,
      previousStatus: originalStatus?.fromStatus ?? null,
      legalBasis: request.legalBasisText,
      deadlineAt: request.deadlineAt,
      sentAt: request.sentAt,
      rule,
      replies: replies.map((row) => ({
        classification: row.classification,
        count: row._count._all,
      })),
      manualSubmissionCount: submissions._count._all,
      firstManualSubmission: submissions._min.submittedOn,
      lastManualSubmission: submissions._max.submittedOn,
      recordedReceipt: submissions._min.receivedOn,
      snapshotCount: snapshots,
      evidenceCount: files,
      realAcceptedEmails: realEmails,
      simulatedEmails,
    };
  });
}
