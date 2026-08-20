/**
 * Template checksum helper.
 *
 * `RequestTemplateVersion.checksum` is the SHA-256 hex digest of
 * `subject + "\n" + body`, so a silent edit of a published version is visible
 * by comparing the stored checksum with a freshly computed one.
 */
import { createHash } from "node:crypto";

export function templateChecksum(subject: string, body: string): string {
  return createHash("sha256").update(`${subject}\n${body}`, "utf8").digest("hex");
}
