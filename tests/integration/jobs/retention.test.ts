import { afterEach, describe, expect, it } from "vitest";
import { runRetentionSweep } from "@/lib/jobs/retentionSweep";
import { encryptBytes, sha256Hex } from "@/lib/security/crypto";
import { MemoryStorageAdapter, setStorageForTests } from "@/lib/storage";
import { testPrisma } from "../../helpers/db";

afterEach(() => setStorageForTests());

async function pendingFiles(count: number) {
  const storage = new MemoryStorageAdapter();
  setStorageForTests(storage);
  const user = await testPrisma.user.create({
    data: { email: "purge-owner@example.org" },
  });
  const body = Buffer.from("%PDF-1.7 synthetic retained evidence");
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `pending-file-${index}`,
    userId: user.id,
    storageKey: `private/${user.id}/${index}`,
    kind: "OTHER" as const,
    storageBackend: storage.backend,
    contentType: "application/pdf",
    byteSize: body.byteLength,
    checksumSha256: sha256Hex(body),
    encryption: "APPLICATION_AES_GCM" as const,
    storageState: "PURGE_PENDING" as const,
  }));
  await Promise.all(
    rows.map((row) =>
      storage.put({
        key: row.storageKey,
        contentType: "application/octet-stream",
        body: encryptBytes(body, {
          table: "EvidenceFile",
          column: "object",
          recordId: row.id,
        }),
      })
    )
  );
  await testPrisma.evidenceFile.createMany({ data: rows });
  return { rows, storage };
}

describe("resumable retention cleanup", () => {
  it("drains unfinished encrypted object purges across more than one page", async () => {
    const { rows, storage } = await pendingFiles(125);
    const result = await runRetentionSweep({ dryRun: false });
    expect(
      await testPrisma.evidenceFile.count({ where: { storageState: "PURGED" } })
    ).toBe(125);
    expect(result.metadata).toMatchObject({
      evidence: 125,
      unfinishedFilePurgesRemaining: 0,
    });
    expect(
      (await Promise.all(rows.map((row) => storage.exists(row.storageKey)))).some(Boolean)
    ).toBe(false);
  });

  it("includes unfinished purges in a dry run without deleting any object", async () => {
    const { rows, storage } = await pendingFiles(3);
    const result = await runRetentionSweep({ dryRun: true });
    expect(result.metadata).toMatchObject({
      unfinishedFilePurgesRemaining: 3,
      evidence: 0,
    });
    expect(
      await testPrisma.evidenceFile.count({ where: { storageState: "PURGE_PENDING" } })
    ).toBe(3);
    expect(
      (await Promise.all(rows.map((row) => storage.exists(row.storageKey)))).every(
        Boolean
      )
    ).toBe(true);
  });

  it("reports the bounded pass backlog and resumes it promptly instead of claiming cleanup is complete", async () => {
    await pendingFiles(2001);
    const result = await runRetentionSweep({ dryRun: false });
    expect(result.metadata).toMatchObject({
      evidence: 2000,
      unfinishedFilePurgesRemaining: 1,
    });
    expect(result.message).toMatch(/remain queued/);
    expect(result.repeatAfterSeconds).toBe(1);
    const resumed = await runRetentionSweep({ dryRun: false });
    expect(resumed.metadata).toMatchObject({
      evidence: 1,
      unfinishedFilePurgesRemaining: 0,
    });
    expect(resumed.repeatAfterSeconds).toBeUndefined();
    expect(
      await testPrisma.evidenceFile.count({ where: { storageState: "PURGED" } })
    ).toBe(2001);
  }, 120_000);
});
