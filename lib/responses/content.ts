import { compile } from "html-to-text";
import { z } from "zod";
import { AppError } from "@/lib/core/errors";
import { decryptField, encryptField } from "@/lib/security/crypto";
import { stripControlCharacters, stripInvisible } from "@/lib/security/sanitize";

const fromHtml = compile({
  wordwrap: false,
  limits: {
    maxInputLength: 2_000_000,
    maxDepth: 100,
    maxChildNodes: 50_000,
    ellipsis: "[Content omitted by HTML safety limit]",
  },
  selectors: [
    ...["script", "style", "img", "iframe", "object", "embed", "svg"].map((selector) => ({
      selector,
      format: "skip",
    })),
    { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
  ],
});

/** This produces text only. React escapes it; no HTML, links or remote images execute. */
export function correspondenceText(input: { text: string | null; html: string | null }) {
  if ((input.html?.length ?? 0) > 2_000_000 || (input.text?.length ?? 0) > 100_000)
    throw new AppError({
      code: "VALIDATION_FAILED",
      message:
        "This reply exceeds the automatic import limit. Record it manually or attach a redacted file.",
    });
  const text = input.text?.trim() ? input.text : input.html ? fromHtml(input.html) : "";
  if (text.length > 100_000)
    throw new AppError({
      code: "VALIDATION_FAILED",
      message:
        "The converted reply exceeds the automatic import limit. Record it manually.",
    });
  return stripInvisible(stripControlCharacters(text)).replace(/\r\n?/g, "\n").trim();
}

export function encryptResponseContent(
  id: string,
  input: {
    fromAddress: string;
    subject: string;
    body: string;
    metadata?: Record<string, unknown>;
  }
) {
  const encrypted = (column: string, value: string) =>
    encryptField(value, { table: "BrokerResponse", column, recordId: id });
  return {
    fromAddressEnc: input.fromAddress
      ? encrypted("fromAddressEnc", input.fromAddress)
      : null,
    subjectEnc: encrypted("subjectEnc", input.subject),
    bodyEnc: input.body ? encrypted("bodyEnc", input.body) : null,
    metadataEnc: input.metadata
      ? encrypted("metadataEnc", JSON.stringify(input.metadata))
      : null,
  };
}

const contentInfoSchema = z.object({ legacyPreviewOnly: z.boolean().default(false) });

export function readResponseContent(row: {
  id: string;
  fromAddressEnc: string | null;
  subjectEnc: string | null;
  bodyEnc: string | null;
  fromAddress: string | null;
  bodyPreview: string | null;
  metadataEnc?: string | null;
}) {
  const read = (column: "fromAddressEnc" | "subjectEnc" | "bodyEnc", fallback = "") =>
    row[column]
      ? decryptField(row[column]!, { table: "BrokerResponse", column, recordId: row.id })
      : fallback;
  const metadata = contentInfoSchema.parse(
    row.metadataEnc
      ? JSON.parse(
          decryptField(row.metadataEnc, {
            table: "BrokerResponse",
            column: "metadataEnc",
            recordId: row.id,
          })
        )
      : {}
  );
  return {
    fromAddress: read("fromAddressEnc", row.fromAddress ?? ""),
    subject: read("subjectEnc"),
    body: read("bodyEnc", row.bodyPreview ?? ""),
    previewOnly: metadata.legacyPreviewOnly || Boolean(!row.bodyEnc && row.bodyPreview),
  };
}
