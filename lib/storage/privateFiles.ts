import { randomUUID } from "node:crypto";
import type { EvidenceKind } from "@prisma/client";

import { env } from "@/lib/config/env";
import { AppError } from "@/lib/core/errors";
import {
  createPrivateFileIntent,
  markEvidencePurged,
  markPrivateFilePurgePending,
  markPrivateFileReady,
} from "@/lib/db/repositories/evidence";
import type { ActorContext } from "@/lib/permissions/actor";
import { encryptBytes, encryptField, sha256Hex } from "@/lib/security/crypto";
import { getStorage } from "@/lib/storage";

export async function storePrivateFile(
  actor: ActorContext,
  input: {
    userId: string;
    profileId?: string | null;
    requestId?: string | null;
    kind: EvidenceKind;
    filename: string;
    contentType: string;
    body: Buffer;
    expiresAt?: Date | null;
    identityConsentRecordId?: string | null;
    /** Generated artifacts remain inaccessible until their fenced transaction publishes them. */
    deferReady?: boolean;
  }
) {
  const id = randomUUID();
  const storage = getStorage();
  const key = `private/${input.userId}/${id}`;
  // Durable intent first: a crash at any later point remains visible to cleanup.
  const intent = await createPrivateFileIntent(actor, {
    id,
    userId: input.userId,
    profileId: input.profileId ?? null,
    removalRequestId: input.requestId ?? null,
    kind: input.kind,
    storageKey: key,
    storageBackend: storage.backend,
    contentType: input.contentType,
    byteSize: input.body.byteLength,
    checksumSha256: sha256Hex(input.body),
    encryptionKeyId: env.encryptionActiveKey.keyId,
    filenameEnc: encryptField(input.filename, {
      table: "EvidenceFile",
      column: "filenameEnc",
      recordId: id,
    }),
    filenameMasked: input.filename.replace(/.(?=.{4})/gu, "•"),
    expiresAt: input.expiresAt ?? null,
    identityConsentRecordId: input.identityConsentRecordId ?? null,
  });
  try {
    await storage.put({
      key,
      body: encryptBytes(input.body, {
        table: "EvidenceFile",
        column: "object",
        recordId: id,
      }),
      contentType: "application/octet-stream",
      temporary: Boolean(input.expiresAt),
    });
    return input.deferReady ? intent : await markPrivateFileReady(id);
  } catch (error) {
    // If the database is unavailable the original UPLOADING intent still exists.
    await markPrivateFilePurgePending(id).catch(() => undefined);
    try {
      await storage.delete(key);
      await markEvidencePurged(id);
    } catch {
      // The retention worker resumes from the durable intent, with the recorded backend.
    }
    throw new AppError({
      code: "STORAGE_FAILED",
      message:
        "The upload could not be completed. Any stored copy has been scheduled for cleanup.",
      cause: error,
    });
  }
}

export async function purgePrivateFile(file: {
  id: string;
  storageKey: string;
  storageBackend: string;
}): Promise<void> {
  await markPrivateFilePurgePending(file.id);
  await getStorage(file.storageBackend).delete(file.storageKey);
  await markEvidencePurged(file.id);
}
