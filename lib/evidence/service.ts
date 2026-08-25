/**
 * Evidence upload, download and deletion.
 */
import { randomUUID } from "node:crypto";

import type { EvidenceKind } from "@prisma/client";

import { recordAudit } from "@/lib/audit/service";
import { getSetting } from "@/lib/config/runtimeSettings";
import { AppError, ValidationError } from "@/lib/core/errors";
import {
  createEvidenceFile,
  getOwnedEvidenceForDownload,
  listOwnedEvidence,
  markEvidenceAccessed,
  softDeleteEvidence,
} from "@/lib/db/repositories/evidence";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { getStorage } from "@/lib/storage";
import { encryptField, sha256Hex } from "@/lib/security/crypto";
import { sanitiseText } from "@/lib/security/sanitize";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function listEvidence(actor: ActorContext, profileId: string | null) {
  return listOwnedEvidence(actor, profileId);
}

export async function uploadEvidence(
  actor: ActorContext,
  input: {
    kind: EvidenceKind;
    requestId: string | null;
    filename: string;
    contentType: string;
    body: Buffer;
  }
) {
  requirePermission(actor, "evidence:upload", { ownerUserId: actor.userId });

  if (!ALLOWED_TYPES.has(input.contentType)) {
    throw new ValidationError("Allowed types are PNG, JPEG and PDF.");
  }
  if (input.body.byteLength === 0 || input.body.byteLength > MAX_BYTES) {
    throw new ValidationError("Files must be between 1 byte and 8 MB.");
  }

  let profileId: string | null = null;
  if (input.requestId) {
    const request = await getOwnedRequest(actor, input.requestId);
    profileId = request.profileId;
    if (input.kind === "IDENTITY_DOCUMENT" && !request.manualReviewRequired) {
      throw new ValidationError(
        "Identity documents are only accepted when a request actually asked for identity proof."
      );
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
  const id = randomUUID();
  const key = `evidence/${actor.userId}/${id}`;
  const stored = await getStorage().put({
    key,
    body: input.body,
    contentType: input.contentType,
    temporary: input.kind === "IDENTITY_DOCUMENT",
  });

  const temporaryIdDays = await getSetting("retentionTemporaryIdFileDays");
  const expiresAt =
    input.kind === "IDENTITY_DOCUMENT"
      ? new Date(Date.now() + temporaryIdDays * 24 * 60 * 60 * 1000)
      : null;

  const file = await createEvidenceFile({
    id,
    user: { connect: { id: actor.userId } },
    ...(profileId ? { profile: { connect: { id: profileId } } } : {}),
    ...(input.requestId ? { removalRequest: { connect: { id: input.requestId } } } : {}),
    kind: input.kind,
    storageKey: stored.key,
    storageBackend: getStorage().backend,
    contentType: input.contentType,
    byteSize: stored.byteSize,
    checksumSha256: stored.checksumSha256 || sha256Hex(input.body),
    filenameEnc: encryptField(filename, {
      table: "EvidenceFile",
      column: "filenameEnc",
      recordId: id,
    }),
    filenameMasked: filename.replace(/.(?=.{4})/g, "•"),
    isTemporary: input.kind === "IDENTITY_DOCUMENT",
    ...(expiresAt ? { expiresAt } : {}),
    createdById: actor.userId,
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
  const body = await getStorage().get(file.storageKey);
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
  const file = await getOwnedEvidenceForDownload(actor, evidenceId);
  try {
    await getStorage().delete(file.storageKey);
  } catch (error) {
    throw new AppError({
      code: "STORAGE_FAILED",
      message: "The file could not be removed from storage.",
      cause: error,
    });
  }
  await softDeleteEvidence(actor, evidenceId);
  await recordAudit({
    actor,
    action: "evidence.deleted",
    resourceType: "evidence_file",
    resourceId: evidenceId,
  });
}
