import { afterEach, describe, expect, it, vi } from "vitest";

import {
  uploadEvidence,
  downloadEvidence,
  deleteEvidence,
  listEvidence,
} from "@/lib/evidence/service";
import { attachmentDisposition } from "@/lib/evidence/files";
import { getStorage, MemoryStorageAdapter, setStorageForTests } from "@/lib/storage";
import { purgePrivateFile } from "@/lib/storage/privateFiles";
import { listUnfinishedFilePurges } from "@/lib/db/repositories/evidence";
import { testPrisma } from "../../helpers/db";
import { testActor } from "../../helpers/actor";
import { workflowFixture } from "../../helpers/workflow";

const body = Buffer.from("%PDF-1.7\nPrivate synthetic evidence\n%%EOF");
afterEach(() => {
  setStorageForTests();
  vi.restoreAllMocks();
});

async function upload() {
  const user = await testPrisma.user.create({ data: { email: "evidence@example.org" } });
  const actor = testActor(user.id);
  const file = await uploadEvidence(actor, {
    kind: "OTHER",
    requestId: null,
    filename: "résumé privé.pdf",
    contentType: "application/pdf",
    body,
  });
  return { actor, file };
}

describe("evidence privacy", () => {
  it("keeps unattached evidence visible with an active profile while enforcing account ownership", async () => {
    const fixture = await workflowFixture();
    const file = await uploadEvidence(fixture.actor, {
      kind: "OTHER",
      requestId: null,
      filename: "sample.pdf",
      contentType: "application/pdf",
      body,
    });
    expect(
      (await listEvidence(fixture.actor, fixture.profile.id)).map((row) => row.id)
    ).toContain(file.id);
    expect(await listEvidence(testActor("another-account"), fixture.profile.id)).toEqual(
      []
    );
  });

  it("rejects uploads that impersonate generated reports or account exports", async () => {
    for (const kind of ["REPORT", "ACCOUNT_EXPORT"] as const) {
      await expect(
        uploadEvidence(testActor("synthetic"), {
          kind: kind as never,
          requestId: null,
          filename: "sample.pdf",
          contentType: "application/pdf",
          body,
        })
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect(await testPrisma.evidenceFile.count()).toBe(0);
  });
  it("stores encrypted bytes and downloads a verified file with a safe filename", async () => {
    const { actor, file } = await upload();
    const stored = await getStorage(file.storageBackend).get(file.storageKey);
    expect(stored.includes(Buffer.from("Private synthetic evidence"))).toBe(false);
    expect(file.encryption).toBe("APPLICATION_AES_GCM");
    expect((await downloadEvidence(actor, file.id)).body).toEqual(body);
    expect(
      () =>
        new Response(body, {
          headers: { "Content-Disposition": attachmentDisposition(file.filenameMasked!) },
        })
    ).not.toThrow();
    await expect(downloadEvidence(testActor("other-user"), file.id)).rejects.toThrow();
  });

  it("enforces expiry even before the retention worker has run", async () => {
    const { actor, file } = await upload();
    await testPrisma.evidenceFile.update({
      where: { id: file.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(downloadEvidence(actor, file.id)).rejects.toThrow(/expired/);
    await deleteEvidence(actor, file.id);
    expect(await getStorage(file.storageBackend).exists(file.storageKey)).toBe(false);
  });

  it("preserves an unfinished purge when storage deletion fails and resumes it", async () => {
    const storage = new MemoryStorageAdapter();
    setStorageForTests(storage);
    const { actor, file } = await upload();
    vi.spyOn(storage, "delete").mockRejectedValueOnce(
      new Error("Injected storage outage")
    );
    await expect(deleteEvidence(actor, file.id)).rejects.toThrow();
    const pending = await listUnfinishedFilePurges();
    expect(pending.map((item) => item.id)).toContain(file.id);
    await expect(downloadEvidence(actor, file.id)).rejects.toThrow();
    await purgePrivateFile(pending[0]!);
    expect(await storage.exists(file.storageKey)).toBe(false);
    expect(
      (await testPrisma.evidenceFile.findUniqueOrThrow({ where: { id: file.id } }))
        .storageState
    ).toBe("PURGED");
  });

  it("compensates for metadata finalization failures without leaving an orphan", async () => {
    const storage = new MemoryStorageAdapter();
    const put = vi.spyOn(storage, "put");
    setStorageForTests(storage);
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_reject_ready() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."storageState" = 'READY' THEN RAISE EXCEPTION 'Injected ready failure'; END IF; RETURN NEW; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_reject_ready BEFORE UPDATE ON "EvidenceFile" FOR EACH ROW EXECUTE FUNCTION test_reject_ready()`
    );
    try {
      await expect(upload()).rejects.toThrow();
      expect(put).toHaveBeenCalledOnce();
      expect(await storage.exists(put.mock.calls[0]![0].key)).toBe(false);
      expect(
        await testPrisma.evidenceFile.count({ where: { storageState: "PURGED" } })
      ).toBe(1);
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_reject_ready ON "EvidenceFile"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_reject_ready()`);
    }
  });
});
