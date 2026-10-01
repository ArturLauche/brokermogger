import { ValidationError } from "@/lib/core/errors";
import { z } from "zod";

export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
/** Generated reports and exports have separate approval, expiry, and job workflows. */
export const evidenceUploadKindSchema = z.enum([
  "SCREENSHOT",
  "BROKER_RESPONSE",
  "IDENTITY_DOCUMENT",
  "OTHER",
]);
export type EvidenceUploadKind = z.infer<typeof evidenceUploadKindSchema>;

export function validateUploadSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_EVIDENCE_BYTES) {
    throw new ValidationError("Files must be between 1 byte and 8 MB.");
  }
}

/** Signature checks reject MIME spoofing; downloads remain attachments with nosniff. */
export function validateEvidenceFile(body: Buffer, claimedType: string): void {
  validateUploadSize(body.byteLength);
  const actual = body
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : body.length >= 3 && body[0] === 255 && body[1] === 216 && body[2] === 255
      ? "image/jpeg"
      : body.subarray(0, 5).equals(Buffer.from("%PDF-", "ascii"))
        ? "application/pdf"
        : null;
  if (!actual || actual !== claimedType) {
    throw new ValidationError(
      "Choose a PNG, JPEG or PDF whose contents match its file type."
    );
  }
}

/** RFC 6266: an ASCII fallback plus UTF-8 filename*, never raw Unicode or CR/LF. */
export function attachmentDisposition(filename: string): string {
  const clean =
    filename.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 180) || "download";
  const fallback =
    clean.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/^[. ]+/, "") || "download";
  const encoded = encodeURIComponent(clean.toWellFormed()).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
