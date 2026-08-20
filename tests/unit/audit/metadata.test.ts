/**
 * The audit trail must stay readable for an operator without becoming a second
 * copy of the personal data it describes. These tests pin the scrubbing rules
 * and the canonical hash payload. The database side of the chain is covered by
 * tests/integration/audit.
 */
import { describe, expect, it, vi } from "vitest";

const appendAuditLog = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/repositories/audit", () => ({
  appendAuditLog,
  listAuditChainWindow: vi.fn(async () => ({ rows: [], previousHash: null })),
}));

const {
  anonymousAuditActor,
  auditCanonicalPayload,
  recordAudit,
  recordAuditOrThrow,
  scrubAuditMetadata,
} = await import("@/lib/audit/service");

function scrub(input: Record<string, unknown>): Record<string, unknown> {
  return scrubAuditMetadata(input).metadata;
}

describe("metadata scrubbing", () => {
  it("redacts a raw email address by key", () => {
    const result = scrubAuditMetadata({ email: "ada@example.org", brokerCount: 2 });

    expect(result.metadata.email).toBeUndefined();
    expect(result.metadata.brokerCount).toBe(2);
    expect(result.redactedKeys).toContain("email");
    expect(result.metadata.redactedKeys).toEqual(["email"]);
    expect(JSON.stringify(result.metadata)).not.toContain("ada@example.org");
  });

  it("redacts email-like keys whatever their casing or prefix", () => {
    const result = scrub({
      contactEmail: "x",
      invited_email: "y",
      EMAIL: "z",
      userMail: "w",
    });

    expect(Object.keys(result)).toEqual(["redactedKeys"]);
  });

  it("redacts a value that looks like an email even under a harmless key", () => {
    const result = scrubAuditMetadata({ note: "contact was ada@example.org" });

    expect(result.metadata.note).toBeUndefined();
    expect(result.redactedKeys).toContain("note");
  });

  it("redacts values that look like a phone number or an opaque token", () => {
    const result = scrub({
      note: "+49 151 23456789",
      reference: "a".repeat(48),
    });

    expect(result.note).toBeUndefined();
    expect(result.reference).toBeUndefined();
  });

  it("keeps masked previews, hashes and enum values", () => {
    const result = scrub({
      maskedEmail: "a**@example.org",
      emailIndex: "b1946ac92492d2347c6235b4d2611184",
      ipHash: "9f86d081884c7d659a2feaa0c55ad015",
      emailPurpose: "MAGIC_LINK",
      signatureVerified: true,
    });

    expect(result.maskedEmail).toBe("a**@example.org");
    expect(result.emailPurpose).toBe("MAGIC_LINK");
    expect(result.signatureVerified).toBe(true);
    expect(result.redactedKeys).toBeUndefined();
  });

  it("drops nested objects because they cannot be checked structurally", () => {
    const result = scrubAuditMetadata({ payload: { email: "ada@example.org" } });

    expect(result.metadata.payload).toBeUndefined();
    expect(result.redactedKeys).toContain("payload");
  });

  it("keeps primitives, dates and short string arrays", () => {
    const result = scrub({
      count: 3,
      enabled: false,
      occurredAt: new Date("2026-08-15T10:00:00.000Z"),
      states: ["QUEUED", "SENT"],
    });

    expect(result.count).toBe(3);
    expect(result.enabled).toBe(false);
    expect(result.occurredAt).toBe("2026-08-15T10:00:00.000Z");
    expect(result.states).toEqual(["QUEUED", "SENT"]);
  });

  it("drops a string array that contains an identifier", () => {
    const result = scrub({ states: ["QUEUED", "ada@example.org"] });
    expect(result.states).toBeUndefined();
  });

  it("truncates a very long string", () => {
    const result = scrub({ note: "word ".repeat(100) });
    expect(String(result.note)).toHaveLength(203);
    expect(String(result.note).endsWith("...")).toBe(true);
  });

  it("treats a long unbroken string as an opaque token and drops it", () => {
    const result = scrubAuditMetadata({ note: "x".repeat(60) });
    expect(result.metadata.note).toBeUndefined();
    expect(result.redactedKeys).toContain("note");
  });

  it("skips null and undefined without marking them as redacted", () => {
    const result = scrubAuditMetadata({ a: null, b: undefined, c: 1 });
    expect(result.redactedKeys).toEqual([]);
    expect(result.metadata).toEqual({ c: 1 });
  });
});

describe("recordAudit", () => {
  it("stores scrubbed metadata and never the raw value", async () => {
    appendAuditLog.mockResolvedValueOnce({
      id: "audit-1",
      sequence: 1n,
      hash: "hash-1",
      prevHash: null,
      createdAt: new Date(),
    });

    await recordAuditOrThrow({
      actor: anonymousAuditActor("request-1", { ipHash: "iphash" }),
      action: "auth.magic_link.requested",
      resourceType: "user",
      metadata: { email: "ada@example.org", maskedEmail: "a**@example.org" },
    });

    const [insert] = appendAuditLog.mock.calls[0] ?? [];
    expect(insert.metadata).toEqual({
      maskedEmail: "a**@example.org",
      redactedKeys: ["email"],
    });
    expect(JSON.stringify(insert)).not.toContain("ada@example.org");
    expect(insert.actorType).toBe("SYSTEM");
    expect(insert.requestId).toBe("request-1");
  });

  it("rejects an action that is not in the catalogue", async () => {
    await expect(
      recordAuditOrThrow({
        actor: anonymousAuditActor("request-2"),
        // Deliberately invalid: the compiler blocks this, the runtime check is
        // the second line of defence for data that arrives from elsewhere.
        action: "auth.magic_link.invented" as never,
        resourceType: "user",
      })
    ).rejects.toThrow(/Unknown audit action/);
  });

  it("never lets a failed audit write break the caller", async () => {
    appendAuditLog.mockRejectedValueOnce(new Error("database is down"));

    const result = await recordAudit({
      actor: anonymousAuditActor("request-3"),
      action: "auth.sign_out",
      resourceType: "session",
    });

    expect(result).toBeNull();
  });
});

describe("canonical payload", () => {
  it("is stable regardless of key order", () => {
    const createdAt = new Date("2026-08-15T10:00:00.000Z");
    const first = auditCanonicalPayload({
      action: "auth.sign_in.succeeded",
      resourceType: "session",
      resourceId: "session-1",
      actorUserId: "user-1",
      targetUserId: "user-1",
      outcome: "SUCCESS",
      createdAt,
      metadata: { b: 2, a: 1 },
    });
    const second = auditCanonicalPayload({
      metadata: { a: 1, b: 2 },
      createdAt,
      outcome: "SUCCESS",
      targetUserId: "user-1",
      actorUserId: "user-1",
      resourceId: "session-1",
      resourceType: "session",
      action: "auth.sign_in.succeeded",
    });

    expect(first).toBe(second);
  });
});
