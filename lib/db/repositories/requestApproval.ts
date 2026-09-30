import { randomUUID } from "node:crypto";

import { env } from "@/lib/config/env";
import { assertBrokerRequestCompatible } from "@/lib/brokers/coverage";
import { AppError } from "@/lib/core/errors";
import { prisma } from "@/lib/db/client";
import { parseJobPayload } from "@/lib/jobs/payloads";
import type { ActorContext } from "@/lib/permissions/actor";
import {
  assertEnvelopeMatchesRequest,
  readApprovalEnvelope,
  type ApprovalCommand,
} from "@/lib/requests/envelope";
import { readSnapshotText } from "@/lib/requests/snapshot";
import { blindIndex, encryptField, sha256Hex } from "@/lib/security/crypto";
import { maskEmail } from "@/lib/security/masking";

import { appendConsentRecordInTx } from "./consent";
import { sendingIdentityInTx } from "./inboundMailboxes";
import { assertCurrentProfileConsent, loadRequestForDecision } from "./requestDecision";
import { appendRequestEventInTx, applyRequestStatusInTx } from "./requests";
import { assertCurrentLegalBasisInTx } from "./requestLegalEligibility";

const STATEMENT =
  "I have reviewed the profile, consent status, destination, channel, reply address, legal basis, selected identifiers and final request text. I approve this exact message.";

export async function commitRequestApproval(actor: ActorContext, input: ApprovalCommand) {
  return prisma.$transaction(
    async (tx) => {
      const request = await loadRequestForDecision(
        tx,
        actor,
        input.requestId,
        "request:approve"
      );
      const snapshot = request.currentSnapshotId
        ? await tx.requestSnapshot.findFirst({
            where: { id: request.currentSnapshotId, removalRequestId: request.id },
          })
        : null;
      if (!snapshot || snapshot.envelopeHash !== input.envelopeHash)
        throw new AppError({
          code: "CONFLICT",
          message: "The message changed. Reload its review before approving.",
        });
      const envelope = readApprovalEnvelope(snapshot);
      const text = readSnapshotText(snapshot);
      const identifiers = await tx.profileIdentifier.findMany({
        where: {
          profileId: request.profileId,
          id: { in: request.includedIdentifierIds },
          deletedAt: null,
        },
        select: { id: true, valueBi: true },
      });
      assertEnvelopeMatchesRequest(
        envelope,
        request,
        identifiers,
        request.profile,
        await sendingIdentityInTx(tx, request.userId)
      );
      const consent = assertCurrentProfileConsent(request.profile);
      await assertCurrentLegalBasisInTx(tx, request);
      assertBrokerRequestCompatible(
        request.broker,
        request.jurisdictionId,
        request.requestType
      );
      if (
        request.approvedSnapshotId === snapshot.id &&
        request.approvedEnvelopeHash === snapshot.envelopeHash &&
        request.approvalConsentRecordId
      )
        return { requestId: request.id, alreadyApproved: true };
      if (!["AWAITING_USER_APPROVAL", "MANUAL_REVIEW_REQUIRED"].includes(request.status))
        throw new AppError({
          code: "CONFLICT",
          message:
            "This request is not awaiting approval. Regenerate or edit a fresh draft before approving it.",
        });
      if (!envelope.destination)
        throw new AppError({
          code: "BROKER_NOT_SENDABLE",
          message:
            "This draft has no destination. Update the broker contact and regenerate the draft.",
        });
      if (request.status === "MANUAL_REVIEW_REQUIRED") {
        await applyRequestStatusInTx(tx, {
          requestId: request.id,
          from: request.status,
          to: "AWAITING_USER_APPROVAL",
          actor: "USER",
          actorUserId: actor.userId,
          message: "Self-service review completed.",
        });
      }
      const from =
        request.status === "MANUAL_REVIEW_REQUIRED"
          ? "AWAITING_USER_APPROVAL"
          : request.status;
      await applyRequestStatusInTx(tx, {
        requestId: request.id,
        from,
        to: "APPROVED",
        actor: "USER",
        actorUserId: actor.userId,
        message: "The account holder approved the complete message envelope.",
      });
      const proof = await appendConsentRecordInTx(tx, {
        profileId: request.profileId,
        actorUserId: actor.userId,
        purpose: "REQUEST_SUBMISSION",
        method: "SELF_ATTESTATION",
        status: request.profile.consentStatus,
        statementText: STATEMENT,
        removalRequestId: request.id,
        ...(consent ? { householdConsentId: consent.id } : {}),
        evidence: {
          envelopeVersion: 1,
          envelopeHash: snapshot.envelopeHash,
          snapshotId: snapshot.id,
          contentHash: snapshot.contentHash,
        },
      });
      await tx.removalRequest.update({
        where: { id: request.id },
        data: {
          approvedAt: new Date(),
          approvedByUserId: actor.userId,
          approvedSnapshotId: snapshot.id,
          approvedEnvelopeHash: snapshot.envelopeHash,
          approvalConsentRecordId: proof.id,
          ...(request.manualReviewRequired
            ? { manualReviewResolvedAt: new Date(), manualReviewResolvedBy: actor.userId }
            : {}),
        },
      });
      await appendRequestEventInTx(tx, {
        removalRequestId: request.id,
        type: "APPROVAL",
        fromStatus: from,
        toStatus: "APPROVED",
        actorType: "USER",
        actorUserId: actor.userId,
        message: "Approval bound to the immutable message and delivery details.",
        payload: {
          snapshotId: snapshot.id,
          envelopeHash: snapshot.envelopeHash,
          consentRecordId: proof.id,
        },
      });
      if (request.channel !== "EMAIL") {
        await applyRequestStatusInTx(tx, {
          requestId: request.id,
          from: "APPROVED",
          to: "NEEDS_USER_ACTION",
          actor: "SYSTEM",
          actorUserId: null,
          message:
            "Approved for manual submission. Follow the broker’s portal or postal steps yourself; nothing has been submitted.",
        });
      } else {
        const id = randomUUID();
        const purpose =
          envelope.followUpNumber > 0 ? "BROKER_FOLLOW_UP" : "BROKER_REQUEST";
        const latest = await tx.outboundEmail.aggregate({
          where: { removalRequestId: request.id, purpose },
          _max: { attempt: true },
        });
        const attempt = (latest._max.attempt ?? 0) + 1;
        const idempotencyKey = `request-${request.id}-${snapshot.id}`;
        const encrypted = (column: string, value: string) =>
          encryptField(value, { table: "OutboundEmail", column, recordId: id });
        await tx.outboundEmail.create({
          data: {
            id,
            purpose,
            provider:
              env.EMAIL_PROVIDER === "mock"
                ? "MOCK"
                : env.EMAIL_PROVIDER === "sandbox"
                  ? "SANDBOX"
                  : "RESEND",
            removalRequestId: request.id,
            userId: request.userId,
            profileId: request.profileId,
            toAddressEnc: encrypted("toAddressEnc", envelope.destination),
            toAddressMasked: maskEmail(envelope.destination),
            toAddressHash: blindIndex(envelope.destination, "outbound:to", "email"),
            fromAddress: envelope.fromAddress,
            replyToEnc: encrypted("replyToEnc", envelope.replyTo),
            subjectEnc: encrypted("subjectEnc", text.subject),
            bodyHash: sha256Hex(text.body),
            attempt,
            snapshotId: snapshot.id,
            approvalEnvelopeHash: snapshot.envelopeHash,
            approvalConsentRecordId: proof.id,
            idempotencyKey,
          },
        });
        await tx.backgroundJob.create({
          data: {
            type: "SEND_REQUEST",
            payloadJson: parseJobPayload("SEND_REQUEST", {
              removalRequestId: request.id,
              snapshotId: snapshot.id,
              attempt,
            }),
            idempotencyKey: `send:${request.id}:${snapshot.id}:${attempt}`,
            relatedRequestId: request.id,
            relatedUserId: request.userId,
            maxAttempts: env.JOB_MAX_ATTEMPTS,
          },
        });
      }
      return { requestId: request.id, alreadyApproved: false };
    },
    { timeout: 15_000 }
  );
}
