import { z } from "zod";

import { AppError } from "@/lib/core/errors";
import { decryptField, encryptField, sha256Hex } from "@/lib/security/crypto";

const snapshotTextSchema = z.object({
  subject: z.string().max(200),
  body: z.string().max(100_000),
});

export function encryptSnapshotText(id: string, subject: string, body: string): string {
  return encryptField(JSON.stringify(snapshotTextSchema.parse({ subject, body })), {
    table: "RequestSnapshot",
    column: "payloadEnc",
    recordId: id,
  });
}

export function readSnapshotText<
  T extends {
    id: string;
    subject: string;
    body: string;
    contentHash: string;
    payloadEnc: string | null;
    erasedAt: Date | null;
  },
>(snapshot: T): T {
  if (snapshot.erasedAt)
    return {
      ...snapshot,
      subject: "Content erased",
      body: "The personal message content has been erased.",
    };
  if (!snapshot.payloadEnc) return snapshot; // Upgrade compatibility, removed by the backfill.
  const text = snapshotTextSchema.parse(
    JSON.parse(
      decryptField(snapshot.payloadEnc, {
        table: "RequestSnapshot",
        column: "payloadEnc",
        recordId: snapshot.id,
      })
    )
  );
  if (sha256Hex(`${text.subject}\n${text.body}`) !== snapshot.contentHash) {
    throw new AppError({
      code: "INTERNAL_ERROR",
      message: "This snapshot failed its content integrity check.",
    });
  }
  return { ...snapshot, ...text };
}
