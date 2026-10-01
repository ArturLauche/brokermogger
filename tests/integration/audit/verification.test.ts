import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { AuditChainVerifier, auditCanonicalPayload } from "@/lib/audit/hash";
import { recordAuditOrThrow, verifyAuditChain } from "@/lib/audit/service";
import { chainHash } from "@/lib/security/crypto";
import { encryptedAccountEmail } from "@/lib/security/accountEmail";
import {
  requestAuditVerification,
  scanAuditChain,
  publishAuditVerification,
} from "@/lib/db/repositories/auditVerification";
import { getAdminAuditVerification } from "@/lib/admin/service";
import { claimDueJobs } from "@/lib/db/repositories/jobs";
import { deleteAuditLogsOlderThan } from "@/lib/db/repositories/retention";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import type { ClaimedJob } from "@/lib/jobs/types";

async function operator() {
  const id = randomUUID();
  await testPrisma.user.create({
    data: {
      id,
      ...encryptedAccountEmail(id, `${id}@example.org`),
      role: "INSTANCE_ADMIN",
    },
  });
  return testActor(id, "INSTANCE_ADMIN");
}
async function entries(count: number, dates?: Date[]) {
  let previousHash: string | null = null;
  const rows = Array.from({ length: count }, (_, index) => {
    const fields = {
      action: "auth.sign_out",
      resourceType: "session",
      resourceId: null,
      actorUserId: null,
      targetUserId: null,
      outcome: "SUCCESS" as const,
      createdAt: dates?.[index] ?? new Date(),
      metadata: { index },
    };
    const hash = chainHash(previousHash, auditCanonicalPayload(fields));
    const row = { ...fields, actorType: "SYSTEM" as const, prevHash: previousHash, hash };
    previousHash = hash;
    return row;
  });
  await testPrisma.auditLog.createMany({ data: rows });
}
async function claimed() {
  await requestAuditVerification(await operator());
  return (await claimDueJobs("audit-worker", 1))[0] as ClaimedJob<"VERIFY_AUDIT_CHAIN">;
}

describe("background audit verification", () => {
  it("checks multiple pages and reads the saved result without querying the audit chain", async () => {
    await entries(512);
    const job = await claimed();
    const result = await scanAuditChain(job);
    expect(result).toMatchObject({
      checkedCount: 512,
      isValid: true,
      firstSequence: 1n,
      lastSequence: 512n,
      problemKind: null,
    });
    expect(await publishAuditVerification(job, result!)).toBe(true);
    const read = vi
      .spyOn(prisma.auditLog, "findMany")
      .mockRejectedValue(new Error("Full scan during a page read"));
    try {
      expect((await getAdminAuditVerification(await operator())).last).toMatchObject({
        checkedCount: 512,
        isValid: true,
      });
      expect(read).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
    }
  });

  it("detects corruption after the first database page", async () => {
    await entries(512);
    await testPrisma.$executeRawUnsafe(
      'ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_append_only'
    );
    try {
      await testPrisma.$executeRaw`UPDATE "AuditLog" SET outcome = 'DENIED' WHERE sequence = 270`;
    } finally {
      await testPrisma.$executeRawUnsafe(
        'ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_append_only'
      );
    }
    const job = await claimed();
    const result = await scanAuditChain(job);
    expect(result).toMatchObject({
      checkedCount: 270,
      isValid: false,
      problemSequence: 270n,
      problemKind: "hash_mismatch",
    });
    expect(await publishAuditVerification(job, result!)).toBe(true);
  });

  it("does not publish after cancellation or replacement of a worker lease", async () => {
    await entries(2);
    const old = await claimed();
    const result = await scanAuditChain(old);
    await testPrisma.backgroundJob.update({
      where: { id: old.id },
      data: { lockExpiresAt: new Date(0) },
    });
    const current = (
      await claimDueJobs("replacement", 1)
    )[0] as ClaimedJob<"VERIFY_AUDIT_CHAIN">;
    expect(await publishAuditVerification(old, result!)).toBe(false);
    expect(await testPrisma.auditChainVerification.count()).toBe(0);
    await testPrisma.backgroundJob.update({
      where: { id: current.id },
      data: { status: "CANCELLED", leaseToken: null },
    });
    expect(await publishAuditVerification(current, result!)).toBe(false);
    expect(await scanAuditChain(current)).toBeNull();
  });

  it("serializes repeated check requests and rechecks the operator's current role", async () => {
    const actor = await operator();
    const jobs = await Promise.all([
      requestAuditVerification(actor),
      requestAuditVerification(actor),
    ]);
    expect(jobs[0]!.id).toBe(jobs[1]!.id);
    expect(await testPrisma.backgroundJob.count()).toBe(1);
    await testPrisma.user.update({ where: { id: actor.userId }, data: { role: "USER" } });
    await expect(requestAuditVerification(actor)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      getAdminAuditVerification(testActor(actor.userId))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      requestAuditVerification(actor, { injected: "payload" })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("keeps a consistent chain snapshot while audit writers append", async () => {
    await entries(1001);
    const job = await claimed();
    const writer = async () => {
      for (let index = 0; index < 20; index += 1)
        await recordAuditOrThrow({
          actor: testActor("system", "INSTANCE_ADMIN", { isSystem: true }),
          action: "system.job_failed",
          resourceType: "background_job",
          metadata: { index },
        });
    };
    const [result] = await Promise.all([scanAuditChain(job), writer()]);
    expect(result!.isValid).toBe(true);
    expect(BigInt(result!.checkedCount)).toBe(
      result!.lastSequence! - result!.firstSequence! + 1n
    );
    expect(await verifyAuditChain()).toMatchObject({ valid: true, checked: 1021 });
  });

  it("accepts a retained-prefix anchor while still detecting gaps inside the retained chain", async () => {
    await entries(512);
    await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT set_config('brokermogger.allow_append_only_delete', 'on', true)"
      );
      await tx.auditLog.deleteMany({ where: { sequence: { lte: 100n } } });
    });
    const job = await claimed();
    const result = await scanAuditChain(job);
    expect(result).toMatchObject({
      checkedCount: 412,
      isValid: true,
      firstSequence: 101n,
    });
    expect(result!.anchorHash).not.toBeNull();
    await testPrisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT set_config('brokermogger.allow_append_only_delete', 'on', true)"
      );
      await tx.auditLog.delete({
        where: {
          id: (await tx.auditLog.findFirstOrThrow({ where: { sequence: 350n } })).id,
        },
      });
    });
    expect(await scanAuditChain(job)).toMatchObject({
      isValid: false,
      problemSequence: 351n,
      problemKind: "broken_link",
    });
  });

  it("retention removes only a contiguous prefix even if event timestamps are out of order", async () => {
    const old = new Date("2020-01-01"),
      recent = new Date();
    await entries(4, [old, recent, old, recent]);
    expect(await deleteAuditLogsOlderThan(new Date("2021-01-01"), 100)).toBe(1);
    expect(await scanAuditChain(await claimed())).toMatchObject({
      isValid: true,
      checkedCount: 3,
      firstSequence: 2n,
    });
  });

  it("keeps verifier state bounded and preserves sequence values above JavaScript's safe integer range", () => {
    const verifier = new AuditChainVerifier(null);
    const fields = {
      action: "auth.sign_out",
      resourceType: "session",
      resourceId: null,
      actorUserId: null,
      targetUserId: null,
      outcome: "SUCCESS" as const,
      createdAt: new Date(),
      metadata: {},
    };
    expect(
      verifier.consume([
        { ...fields, sequence: 9007199254740993n, prevHash: null, hash: "bad" },
      ])
    ).toBe(false);
    expect(verifier.problemSequence).toBe(9007199254740993n);
  });
});
