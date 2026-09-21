import { afterEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

import { resetEnvCacheForTests } from "@/lib/config/env";
import { decryptBytes, encryptBytes } from "@/lib/security/crypto";
import {
  attachmentDisposition,
  MAX_EVIDENCE_BYTES,
  validateEvidenceFile,
  validateUploadSize,
} from "@/lib/evidence/files";

const context = { table: "EvidenceFile", column: "object", recordId: "file-a" };
afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCacheForTests();
});

describe("encrypted files", () => {
  it("round-trips binary content with bounded overhead and record-bound authentication", () => {
    const body = randomBytes(8192);
    const encrypted = encryptBytes(body, context);
    expect(encrypted.length - body.length).toBeLessThan(100);
    expect(decryptBytes(encrypted, context)).toEqual(body);
    expect(() => decryptBytes(encrypted, { ...context, recordId: "file-b" })).toThrow();
    encrypted[encrypted.length - 1] = encrypted[encrypted.length - 1]! ^ 1;
    expect(() => decryptBytes(encrypted, context)).toThrow();
  });

  it("reads an old envelope after rotating the active key", () => {
    const first = randomBytes(32).toString("base64");
    const second = randomBytes(32).toString("base64");
    vi.stubEnv("ENCRYPTION_KEYS", `one:${first},two:${second}`);
    vi.stubEnv("ENCRYPTION_ACTIVE_KEY_ID", "one");
    resetEnvCacheForTests();
    const encrypted = encryptBytes(Buffer.from("private"), context);
    vi.stubEnv("ENCRYPTION_ACTIVE_KEY_ID", "two");
    resetEnvCacheForTests();
    expect(decryptBytes(encrypted, context).toString()).toBe("private");
  });

  it("rejects malformed envelopes", () => {
    expect(() => decryptBytes(Buffer.from("plaintext"), context)).toThrow();
  });
});

describe("upload and download boundaries", () => {
  it("enforces size before buffering and verifies supported signatures", () => {
    expect(() => validateUploadSize(MAX_EVIDENCE_BYTES + 1)).toThrow();
    expect(() => validateUploadSize(0)).toThrow();
    expect(() => validateUploadSize(MAX_EVIDENCE_BYTES)).not.toThrow();
    expect(() =>
      validateEvidenceFile(Buffer.from("<script>"), "application/pdf")
    ).toThrow();
    expect(() =>
      validateEvidenceFile(Buffer.from("%PDF-1.7\n"), "application/pdf")
    ).not.toThrow();
  });
  it("creates valid headers for masked, Unicode and hostile filenames", () => {
    for (const name of ["••••.pdf", "résumé 日本語.pdf", 'evil"\r\nX-Evil: yes.pdf']) {
      const value = attachmentDisposition(name);
      expect(
        () => new Response(null, { headers: { "Content-Disposition": value } })
      ).not.toThrow();
      expect(value).not.toMatch(/[\r\n]/);
      expect(value).toContain("filename*=UTF-8''");
    }
  });
});
