import { describe, expect, it } from "vitest";

import {
  blindIndex,
  canonicalJson,
  chainHash,
  decryptField,
  encryptField,
  needsKeyRotation,
  normaliseForIndex,
} from "@/lib/security/crypto";

const context = {
  table: "ProfileIdentifier",
  column: "valueEnc",
  recordId: "identifier-1",
};

describe("field encryption", () => {
  it("round trips a value", () => {
    const envelope = encryptField("ada@example.org", context);
    expect(envelope.startsWith("bm1.v1.")).toBe(true);
    expect(decryptField(envelope, context)).toBe("ada@example.org");
  });

  it("produces a different ciphertext for the same plaintext", () => {
    const first = encryptField("same value", context);
    const second = encryptField("same value", context);
    expect(first).not.toBe(second);
  });

  it("rejects a ciphertext moved to another record", () => {
    const envelope = encryptField("ada@example.org", context);
    expect(() => decryptField(envelope, { ...context, recordId: "identifier-2" })).toThrow(
      /failed authentication/i
    );
  });

  it("rejects a ciphertext moved to another column", () => {
    const envelope = encryptField("ada@example.org", context);
    expect(() => decryptField(envelope, { ...context, column: "legalNameEnc" })).toThrow(
      /failed authentication/i
    );
  });

  it("detects tampering with the auth tag", () => {
    const envelope = encryptField("ada@example.org", context);
    const parts = envelope.split(".");
    parts[4] = Buffer.alloc(16, 1).toString("base64url");
    expect(() => decryptField(parts.join("."), context)).toThrow();
  });

  it("reports that the active key does not need rotation", () => {
    expect(needsKeyRotation(encryptField("value", context))).toBe(false);
  });
});

describe("blind index", () => {
  it("is stable for equal normalised values", () => {
    expect(blindIndex("Ada@Example.ORG ", "identifier:email", "email")).toBe(
      blindIndex("ada@example.org", "identifier:email", "email")
    );
  });

  it("separates scopes", () => {
    expect(blindIndex("ada@example.org", "identifier:email", "email")).not.toBe(
      blindIndex("ada@example.org", "household:email", "email")
    );
  });

  it("normalises phone numbers", () => {
    expect(normaliseForIndex("+49 (30) 123-456", "phone")).toBe("+4930123456");
    expect(normaliseForIndex("0301 23456", "phone")).toBe("30123456");
  });
});

describe("hash chain", () => {
  it("changes when the payload changes", () => {
    const first = chainHash(null, canonicalJson({ a: 1 }));
    const second = chainHash(first, canonicalJson({ a: 2 }));
    expect(first).not.toBe(second);
    expect(chainHash(null, canonicalJson({ a: 1 }))).toBe(first);
  });

  it("canonicalises key order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
});
