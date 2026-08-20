/**
 * Audit chain integrity against a real database.
 *
 * Three properties matter: consecutive rows link to each other, the append-only
 * trigger refuses edits, and `verifyAuditChain()` actually notices when someone
 * changes a row through the retention escape hatch.
 */
import { describe, expect, it } from "vitest";

import {
  anonymousAuditActor,
  recordAuditOrThrow,
  recordSecurityEvent,
  verifyAuditChain,
} from "@/lib/audit/service";

import { testPrisma } from "../../helpers/db";

/**
 * Simulates an attacker with direct database access. The append-only trigger
 * refuses every UPDATE, so the trigger has to be disabled for the statement.
 * That is precisely the threat model the hash chain exists for: someone who can
 * edit rows still cannot make the chain recompute.
 */
async function tamperWithRow(statement: string, parameters: unknown[]): Promise<void> {
  await testPrisma.$executeRawUnsafe(
    `ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_append_only`
  );
  try {
    await testPrisma.$executeRawUnsafe(statement, ...parameters);
  } finally {
    await testPrisma.$executeRawUnsafe(
      `ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_append_only`
    );
  }
}

async function writeEntries(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await recordAuditOrThrow({
      actor: anonymousAuditActor(`request-${index}`, { ipHash: "iphash" }),
      action: "auth.magic_link.requested",
      resourceType: "user",
      reason: `entry ${index}`,
      metadata: { attempt: index },
    });
  }
}

describe("hash chain", () => {
  it("links every row to its predecessor", async () => {
    await writeEntries(4);

    const rows = await testPrisma.auditLog.findMany({ orderBy: { sequence: "asc" } });

    expect(rows).toHaveLength(4);
    expect(rows[0]?.prevHash).toBeNull();
    expect(rows[1]?.prevHash).toBe(rows[0]?.hash);
    expect(rows[2]?.prevHash).toBe(rows[1]?.hash);
    expect(rows[3]?.prevHash).toBe(rows[2]?.hash);
    expect(new Set(rows.map((row) => row.hash)).size).toBe(4);
  });

  it("keeps one chain when writers run concurrently", async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_unused, index) =>
        recordAuditOrThrow({
          actor: anonymousAuditActor(`parallel-${index}`),
          action: "auth.sign_in.succeeded",
          resourceType: "session",
          metadata: { index },
        })
      )
    );

    const rows = await testPrisma.auditLog.findMany({ orderBy: { sequence: "asc" } });
    expect(rows).toHaveLength(8);

    // No fork: every prevHash appears exactly once, and no hash is reused.
    const prevHashes = rows.slice(1).map((row) => row.prevHash);
    expect(new Set(prevHashes).size).toBe(7);

    const verification = await verifyAuditChain();
    expect(verification).toEqual({ checked: 8, valid: true, firstProblem: null });
  });

  it("verifies a limited window against the row before it", async () => {
    await writeEntries(6);

    const verification = await verifyAuditChain(3);
    expect(verification.valid).toBe(true);
    expect(verification.checked).toBe(3);
  });

  it("reports an empty table as valid", async () => {
    const verification = await verifyAuditChain();
    expect(verification).toEqual({ checked: 0, valid: true, firstProblem: null });
  });
});

describe("tamper detection", () => {
  it("detects an edited row", async () => {
    await writeEntries(3);

    const target = await testPrisma.auditLog.findFirstOrThrow({
      orderBy: { sequence: "asc" },
      skip: 1,
    });

    await tamperWithRow(`UPDATE "AuditLog" SET "outcome" = 'DENIED' WHERE "id" = $1`, [
      target.id,
    ]);

    const verification = await verifyAuditChain();

    expect(verification.valid).toBe(false);
    expect(verification.firstProblem?.problem).toBe("hash_mismatch");
    expect(verification.firstProblem?.auditLogId).toBe(target.id);
    expect(verification.firstProblem?.sequence).toBe(Number(target.sequence));
  });

  it("detects a row that was inserted with a wrong hash", async () => {
    await writeEntries(2);

    const last = await testPrisma.auditLog.findFirstOrThrow({
      orderBy: { sequence: "desc" },
    });

    await testPrisma.auditLog.create({
      data: {
        actorType: "SYSTEM",
        action: "auth.sign_out",
        resourceType: "session",
        outcome: "SUCCESS",
        requestId: "forged",
        metadata: {},
        prevHash: last.hash,
        hash: "0".repeat(64),
      },
    });

    const verification = await verifyAuditChain();
    expect(verification.valid).toBe(false);
    expect(verification.firstProblem?.problem).toBe("hash_mismatch");
    expect(verification.firstProblem?.storedHash).toBe("0".repeat(64));
  });

  it("detects a broken link when a row points at the wrong predecessor", async () => {
    await writeEntries(2);

    const last = await testPrisma.auditLog.findFirstOrThrow({
      orderBy: { sequence: "desc" },
    });

    await tamperWithRow(`UPDATE "AuditLog" SET "prevHash" = $1 WHERE "id" = $2`, [
      "f".repeat(64),
      last.id,
    ]);

    const verification = await verifyAuditChain();
    expect(verification.valid).toBe(false);
    expect(verification.firstProblem?.problem).toBe("broken_link");
    expect(verification.firstProblem?.auditLogId).toBe(last.id);
  });
});

describe("append-only enforcement", () => {
  it("rejects an UPDATE on AuditLog", async () => {
    await writeEntries(1);
    const row = await testPrisma.auditLog.findFirstOrThrow();

    await expect(
      testPrisma.auditLog.update({
        where: { id: row.id },
        data: { reason: "rewritten" },
      })
    ).rejects.toThrow();

    const unchanged = await testPrisma.auditLog.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(unchanged.reason).toBe(row.reason);
  });

  it("rejects a DELETE on AuditLog", async () => {
    await writeEntries(1);
    const row = await testPrisma.auditLog.findFirstOrThrow();

    await expect(testPrisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();

    expect(await testPrisma.auditLog.count()).toBe(1);
  });
});

describe("recordSecurityEvent", () => {
  it("writes a denied outcome against the instance resource", async () => {
    await recordSecurityEvent({
      actor: anonymousAuditActor("request-security", { ipHash: "iphash" }),
      action: "security.suspicious_input_detected",
      reason: "An email webhook could not be authenticated.",
      metadata: { provider: "resend" },
    });

    const row = await testPrisma.auditLog.findFirstOrThrow();
    expect(row.action).toBe("security.suspicious_input_detected");
    expect(row.resourceType).toBe("instance");
    expect(row.outcome).toBe("DENIED");
    expect(row.actorUserId).toBeNull();

    const verification = await verifyAuditChain();
    expect(verification.valid).toBe(true);
  });
});
