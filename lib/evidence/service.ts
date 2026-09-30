/**
 * Evidence upload, download and deletion.
 */
import { recordAudit } from "@/lib/audit/service";
import { getSetting } from "@/lib/config/runtimeSettings";
import { AppError, ValidationError } from "@/lib/core/errors";
import {
  getOwnedEvidenceForDownload,
  getOwnedEvidence,
  listOwnedEvidence,
  markEvidenceAccessed,
  hasPendingVerification,
  scheduleOwnedEvidencePurge,
} from "@/lib/db/repositories/evidence";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { getStorage } from "@/lib/storage";
import { decryptBytes, sha256Hex } from "@/lib/security/crypto";
import { appendConsentRecord } from "@/lib/db/repositories/consent";
import { storePrivateFile, purgePrivateFile } from "@/lib/storage/privateFiles";
import {
  evidenceUploadKindSchema,
  validateEvidenceFile,
  type EvidenceUploadKind,
} from "./files";
import { parseWithSchema } from "@/lib/validation/form";
import { sanitiseText } from "@/lib/security/sanitize";

export async function listEvidence(actor: ActorContext, profileId: string | null) {
  return listOwnedEvidence(actor, profileId);
}

export async function uploadEvidence(
  actor: ActorContext,
  input: {
    kind: EvidenceUploadKind;
    requestId: string | null;
    filename: string;
    contentType: string;
    body: Buffer;
    identityConsent?: boolean;
  }
) {
  requirePermission(actor, "evidence:upload", { ownerUserId: actor.userId });
  parseWithSchema(evidenceUploadKindSchema, input.kind);
  validateEvidenceFile(input.body, input.contentType);
  let identityConsentRecordId: string | null = null;
  let profileId: string | null = null;
  if (input.requestId) {
    const request = await getOwnedRequest(actor, input.requestId);
    profileId = request.profileId;
    if (
      input.kind === "IDENTITY_DOCUMENT" &&
      !(await hasPendingVerification(actor, request.id))
    ) {
      throw new ValidationError(
        "Identity documents are only accepted when a request actually asked for identity proof."
      );
    }
    if (input.kind === "IDENTITY_DOCUMENT") {
      if (input.identityConsent !== true)
        throw new ValidationError(
          "Explicit consent is required to store an optional identity document. External submission remains your responsibility."
        );
      const consent = await appendConsentRecord({
        profileId: request.profileId,
        actorUserId: actor.userId,
        purpose: "IDENTITY_VERIFICATION",
        method: "SELF_ATTESTATION",
        status: request.profile.consentStatus,
        statementText:
          "I choose to store this identity document temporarily in this instance after a recorded broker verification request. It will not be sent automatically.",
        removalRequestId: request.id,
      });
      identityConsentRecordId = consent.id;
    }
  } else if (input.kind === "IDENTITY_DOCUMENT") {
    throw new ValidationError(
      "Identity documents must be attached to a specific request."
    );
  }

  const filename = sanitiseText(input.filename, {
    fieldName: "filename",
    maxLength: 180,
  });
  const temporaryIdDays = await getSetting("retentionTemporaryIdFileDays");
  const expiresAt =
    input.kind === "IDENTITY_DOCUMENT"
      ? new Date(Date.now() + temporaryIdDays * 24 * 60 * 60 * 1000)
      : null;

  const file = await storePrivateFile(actor, {
    userId: actor.userId,
    profileId,
    requestId: input.requestId,
    kind: input.kind,
    filename,
    contentType: input.contentType,
    body: input.body,
    expiresAt,
    identityConsentRecordId,
  });

  await recordAudit({
    actor,
    action: "evidence.uploaded",
    resourceType: "evidence_file",
    resourceId: file.id,
  });

  return file;
}

export async function downloadEvidence(actor: ActorContext, evidenceId: string) {
  const file = await getOwnedEvidenceForDownload(actor, evidenceId);
  const stored = await getStorage(file.storageBackend).get(file.storageKey);
  const body =
    file.encryption === "APPLICATION_AES_GCM" ||
    file.encryption === "CLIENT_SIDE_AES_GCM" ||
    stored.subarray(0, 4).toString("ascii") === "bmf1"
      ? decryptBytes(stored, {
          table: "EvidenceFile",
          column: "object",
          recordId: file.id,
        })
      : stored;
  if (sha256Hex(body) !== file.checksumSha256)
    throw new AppError({
      code: "STORAGE_FAILED",
      message: "The downloaded file does not match its stored integrity checksum.",
    });
  await markEvidenceAccessed(file.id);
  await recordAudit({
    actor,
    action: "evidence.downloaded",
    resourceType: "evidence_file",
    resourceId: file.id,
  });
  return { file, body };
}

export async function deleteEvidence(actor: ActorContext, evidenceId: string) {
  const file = await getOwnedEvidence(actor, evidenceId);
  requirePermission(actor, "evidence:delete", { ownerUserId: file.userId });
  await scheduleOwnedEvidencePurge(actor, evidenceId);
  try {
    await purgePrivateFile(file);
  } catch (error) {
    throw new AppError({
      code: "STORAGE_FAILED",
      message: "The file could not be removed from storage.",
      cause: error,
    });
  }
  await recordAudit({
    actor,
    action: "evidence.deleted",
    resourceType: "evidence_file",
    resourceId: evidenceId,
  });
}
