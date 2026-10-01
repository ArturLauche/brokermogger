import { AppError } from "@/lib/core/errors";
import type { PrismaTransaction } from "@/lib/db/client";
import {
  assertEnvelopeMatchesRequest,
  readApprovalEnvelope,
} from "@/lib/requests/envelope";
import { readSnapshotText } from "@/lib/requests/snapshot";
import { sendingIdentityInTx } from "./inboundMailboxes";
import {
  assertCurrentProfileConsent,
  type loadRequestForDecision,
} from "./requestDecision";

/** The caller owns the account/profile/request locks and has checked its action. */
export async function readApprovedMessageInTx(
  tx: PrismaTransaction,
  request: Awaited<ReturnType<typeof loadRequestForDecision>>,
  snapshotId: string
) {
  const snapshot = await tx.requestSnapshot.findFirst({
    where: { id: snapshotId, removalRequestId: request.id },
  });
  if (
    !snapshot?.envelopeHash ||
    !request.approvalConsentRecordId ||
    request.currentSnapshotId !== snapshotId ||
    request.approvedSnapshotId !== snapshotId ||
    request.approvedEnvelopeHash !== snapshot.envelopeHash ||
    request.approvedByUserId !== request.userId
  )
    throw new AppError({
      code: "CONFLICT",
      message: "This message requires fresh approval of its complete envelope.",
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
  const household = assertCurrentProfileConsent(request.profile);
  const proof = await tx.consentRecord.findFirst({
    where: {
      id: request.approvalConsentRecordId,
      actorUserId: request.userId,
      removalRequestId: request.id,
      profileId: request.profileId,
      purpose: "REQUEST_SUBMISSION",
      revokedAt: null,
    },
  });
  if (
    !proof ||
    proof.status !== request.profile.consentStatus ||
    (proof.expiresAt && proof.expiresAt <= new Date()) ||
    (household && proof.householdConsentId !== household.id) ||
    (proof.evidence as { envelopeHash?: unknown }).envelopeHash !== snapshot.envelopeHash
  )
    throw new AppError({
      code: "CONSENT_INVALID",
      message: "The approval proof is no longer valid. Review the message again.",
    });
  return { snapshot, envelope, text, proof };
}
