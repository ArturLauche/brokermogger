import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  exportMaskedAccount,
  requestAccountExport,
  generateAccountExport,
  downloadAccountExport,
  deleteAccountExport,
} from "@/lib/exports/service";
import { loadAccountExportPage } from "@/lib/db/repositories/accountExportData";
import {
  listAccountExports,
  beginAccountExport,
  publishAccountExport,
} from "@/lib/db/repositories/accountExports";
import { claimDueJobs, expireStaleLocks } from "@/lib/db/repositories/jobs";
import {
  markAccountDeletionRequested,
  anonymiseDeletedAccount,
} from "@/lib/db/repositories/account";
import { softDeleteIdentifier } from "@/lib/db/repositories/profiles";
import { deleteOwnedResponse } from "@/lib/db/repositories/responses";
import { uploadEvidence, downloadEvidence, deleteEvidence } from "@/lib/evidence/service";
import { getStorage, clearMemoryStorage } from "@/lib/storage";
import { createJobHandlers } from "@/lib/jobs/handlers";
import { runClaimedJob } from "@/lib/jobs/queue";
import { encryptResponseContent } from "@/lib/responses/content";
import { encryptedAccountEmail } from "@/lib/security/accountEmail";
import { generateRequests } from "@/lib/requests/lifecycle";
import { EXPORT_SECTIONS, SENSITIVE_EXPORT_NOTICE } from "@/lib/exports/notices";
import { sha256Hex } from "@/lib/security/crypto";
import { systemActor } from "@/lib/permissions/actor";
import type { ClaimedJob } from "@/lib/jobs/types";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

afterEach(() => {
  vi.restoreAllMocks();
  clearMemoryStorage();
});
const input = (mode = "SENSITIVE") => ({
  mode,
  confirmationAccepted: true,
  submissionKey: randomUUID(),
});
async function fixture() {
  const f = await workflowFixture();
  await testPrisma.user.update({
    where: { id: f.user.id },
    data: {
      ...encryptedAccountEmail(f.user.id, f.user.email),
      name: "Personal account name",
    },
  });
  await generateRequests(f.actor, f.input);
  const request = await testPrisma.removalRequest.findFirstOrThrow({
    where: { userId: f.user.id },
  });
  const id = randomUUID();
  const reply = await testPrisma.brokerResponse.create({
    data: {
      id,
      userId: f.user.id,
      removalRequestId: request.id,
      brokerId: request.brokerId,
      receivedAt: new Date(),
      ...encryptResponseContent(id, {
        fromAddress: "reply@example.org",
        subject: "Private subject marker",
        body: "Private reply body marker",
        metadata: { original: "Private webhook marker" },
      }),
    },
  });
  const file = await uploadEvidence(f.actor, {
    requestId: request.id,
    kind: "BROKER_RESPONSE",
    filename: "personal-letter.pdf",
    contentType: "application/pdf",
    body: Buffer.from("%PDF-1.7 Private attachment marker"),
  });
  await testPrisma.session.create({
    data: {
      userId: f.user.id,
      sessionToken: "NEVER_EXPORT_SESSION_SECRET",
      expires: new Date(Date.now() + 86_400_000),
    },
  });
  return { ...f, request, reply, file };
}
async function claim() {
  const [job] = await claimDueJobs("export-test", 1);
  expect(job?.type).toBe("GENERATE_ACCOUNT_EXPORT");
  return job as ClaimedJob<"GENERATE_ACCOUNT_EXPORT">;
}
async function ready(f: Awaited<ReturnType<typeof fixture>>, mode = "SENSITIVE") {
  const data = await requestAccountExport(f.actor, input(mode));
  await runClaimedJob(await claim(), { GENERATE_ACCOUNT_EXPORT: generateAccountExport });
  return data;
}

describe("complete account exports with separate sensitive confirmation", () => {
  it("exports every category, masks personal content and excludes security material and foreign data", async () => {
    const f = await fixture();
    const foreign = await workflowFixture();
    const body = (await exportMaskedAccount(f.actor)).toString();
    const data = JSON.parse(body);
    expect(data.schemaVersion).toBe(2);
    expect(data.mode).toBe("MASKED");
    for (const category of EXPORT_SECTIONS)
      expect(data[category], category).toBeInstanceOf(Array);
    expect(data.identifiers).toHaveLength(1);
    expect(data.snapshots).toHaveLength(1);
    expect(data.responses).toHaveLength(1);
    expect(data.evidenceFiles).toHaveLength(1);
    expect(data.sessions).toHaveLength(1);
    expect(data.recordCounts.requests).toBe(1);
    for (const value of [
      f.user.email,
      "Alex Sample",
      "alex@example.org",
      "Personal account name",
      "Private reply body marker",
      "Private subject marker",
      "Private webhook marker",
      "personal-letter.pdf",
      "NEVER_EXPORT_SESSION_SECRET",
      foreign.user.id,
      foreign.profile.id,
      "valueEnc",
      "valueBi",
      "storageKey",
      "sessionToken",
      "bm1.",
    ])
      expect(body, value).not.toContain(value);
  });

  it("requires explicit sensitive confirmation and binds the proof to its queued work", async () => {
    const f = await fixture();
    await expect(
      requestAccountExport(f.actor, { ...input(), confirmationAccepted: false })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      requestAccountExport(systemActor("no-confirmation"), input())
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      loadAccountExportPage(f.actor, {
        userId: f.user.id,
        mode: "SENSITIVE",
        section: "identifiers",
        cutoff: new Date(),
      })
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    const command = input();
    const results = await Promise.all([
      requestAccountExport(f.actor, command),
      requestAccountExport(f.actor, command),
      requestAccountExport(f.actor, input()),
    ]);
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    expect(
      await testPrisma.backgroundJob.count({ where: { type: "GENERATE_ACCOUNT_EXPORT" } })
    ).toBe(1);
    const row = await testPrisma.accountExport.findUniqueOrThrow({
      where: { id: results[0]!.id },
    });
    expect(row.consentStatementHash).toBe(sha256Hex(SENSITIVE_EXPORT_NOTICE));
    expect(row.consentedAt).toBeInstanceOf(Date);
  });

  it("returns full text only in an encrypted sensitive copy, with 24-hour expiry and no embedded files", async () => {
    const f = await fixture();
    const data = await ready(f);
    const row = await testPrisma.accountExport.findUniqueOrThrow({
      where: { id: data.id },
      include: { evidenceFile: true },
    });
    const stored = await getStorage().get(row.evidenceFile!.storageKey);
    expect(stored.subarray(0, 4).toString()).toBe("bmf1");
    expect(stored.includes(Buffer.from("Alex Sample"))).toBe(false);
    expect(row.expiresAt!.getTime() - row.generatedAt!.getTime()).toBeGreaterThan(
      86_399_000
    );
    const body = (await downloadAccountExport(f.actor, data.id)).body.toString();
    for (const value of [
      f.user.email,
      "Alex Sample",
      "alex@example.org",
      "Private subject marker",
      "Private reply body marker",
      "Private webhook marker",
      "personal-letter.pdf",
    ])
      expect(body, value).toContain(value);
    for (const value of [
      "NEVER_EXPORT_SESSION_SECRET",
      "valueEnc",
      "storageKey",
      "valueBi",
      "bm1.",
      "Private attachment marker",
    ])
      expect(body, value).not.toContain(value);
    const parsed = JSON.parse(body);
    expect(parsed.evidenceFiles[0].downloadPath).toBe(
      `/api/evidence/${f.file.id}/download`
    );
    await testPrisma.accountExport.update({
      where: { id: data.id },
      data: { expiresAt: new Date(0) },
    });
    await testPrisma.evidenceFile.update({
      where: { id: row.evidenceFileId! },
      data: { expiresAt: new Date(0) },
    });
    await expect(downloadAccountExport(f.actor, data.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(downloadEvidence(f.actor, row.evidenceFileId!)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("does not leave an orphaned export when enqueue fails", async () => {
    const f = await fixture();
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_export_job_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected export job failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_export_job_failure BEFORE INSERT ON "BackgroundJob" FOR EACH ROW EXECUTE FUNCTION test_export_job_failure()`
    );
    try {
      await expect(requestAccountExport(f.actor, input())).rejects.toThrow();
      expect(await testPrisma.accountExport.count()).toBe(0);
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_export_job_failure ON "BackgroundJob"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_export_job_failure()`);
    }
  });

  it("blocks foreign and privileged downloads, deletes and source-page inputs", async () => {
    const f = await fixture();
    const data = await ready(f);
    const foreign = await workflowFixture();
    const admin = testActor(foreign.user.id, "INSTANCE_ADMIN", {
      adminGrant: {
        adminActionId: "grant",
        scope: `user:${f.user.id}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(downloadAccountExport(admin, data.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(deleteAccountExport(admin, data.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      loadAccountExportPage(admin, {
        userId: f.user.id,
        mode: "MASKED",
        section: "account",
        cutoff: new Date(),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listAccountExports(admin)).items).toHaveLength(0);
  });

  it("rejects stale leases and expired or changed confirmation before exposing any copy", async () => {
    const f = await fixture();
    const data = await requestAccountExport(f.actor, input());
    const stale = await claim();
    await beginAccountExport(stale);
    await testPrisma.backgroundJob.update({
      where: { id: stale.id },
      data: { lockExpiresAt: new Date(0) },
    });
    await expireStaleLocks();
    const current = await claim();
    expect(await publishAccountExport(stale, "unused")).toBe(false);
    await testPrisma.accountExport.update({
      where: { id: data.id },
      data: { consentStatementHash: "unproven" },
    });
    await generateAccountExport(current);
    expect(
      await testPrisma.evidenceFile.count({ where: { kind: "ACCOUNT_EXPORT" } })
    ).toBe(0);
    expect((await listAccountExports(f.actor)).items[0]!.status).toBe("FAILED");
    await testPrisma.accountExport.update({
      where: { id: data.id },
      data: {
        consentStatementHash: sha256Hex(SENSITIVE_EXPORT_NOTICE),
        consentedAt: new Date(Date.now() - 86_400_001),
      },
    });
    await generateAccountExport(current);
    expect(
      await testPrisma.evidenceFile.count({ where: { kind: "ACCOUNT_EXPORT" } })
    ).toBe(0);
  });

  it.each(["identifier", "response", "evidence"])(
    "invalidates derived copies immediately when an owned %s is erased",
    async (kind) => {
      const f = await fixture();
      const data = await ready(f);
      const copy = await testPrisma.accountExport.findUniqueOrThrow({
        where: { id: data.id },
      });
      if (kind === "identifier") await softDeleteIdentifier(f.actor, f.identifier.id);
      if (kind === "response") await deleteOwnedResponse(f.actor, f.reply.id);
      if (kind === "evidence") await deleteEvidence(f.actor, f.file.id);
      await expect(downloadAccountExport(f.actor, data.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await expect(downloadEvidence(f.actor, copy.evidenceFileId!)).rejects.toMatchObject(
        { code: "NOT_FOUND" }
      );
      expect(await testPrisma.accountExport.count()).toBe(0);
      expect(
        (
          await testPrisma.evidenceFile.findUniqueOrThrow({
            where: { id: copy.evidenceFileId! },
          })
        ).storageState
      ).toBe("PURGE_PENDING");
    }
  );

  it("keeps a staged copy inaccessible and compensates when account deletion races with upload", async () => {
    const f = await fixture();
    const data = await requestAccountExport(f.actor, input());
    const job = await claim();
    const storage = getStorage();
    const put = storage.put.bind(storage);
    vi.spyOn(storage, "put").mockImplementationOnce(async (object) => {
      const file = await testPrisma.evidenceFile.findUniqueOrThrow({
        where: { storageKey: object.key },
      });
      await expect(downloadEvidence(f.actor, file.id)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      await markAccountDeletionRequested(f.actor);
      return put(object);
    });
    await generateAccountExport(job);
    await expect(downloadAccountExport(f.actor, data.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      await testPrisma.evidenceFile.count({
        where: { kind: "ACCOUNT_EXPORT", storageState: "PURGED" },
      })
    ).toBe(1);
    await anonymiseDeletedAccount(systemActor("erase"), f.user.id);
    expect(await testPrisma.accountExport.count()).toBe(0);
  });

  it("cancels a copy, blocks downloads immediately and resumes physical deletion through the worker", async () => {
    const f = await fixture();
    const data = await ready(f, "MASKED");
    const row = await testPrisma.accountExport.findUniqueOrThrow({
      where: { id: data.id },
      include: { evidenceFile: true },
    });
    await deleteAccountExport(f.actor, data.id);
    await expect(downloadAccountExport(f.actor, data.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const [job] = await claimDueJobs("export-purge", 1);
    expect(job!.type).toBe("PURGE_EVIDENCE");
    await runClaimedJob(job!, createJobHandlers());
    expect(await getStorage().exists(row.evidenceFile!.storageKey)).toBe(false);
  });

  it("exports paged record categories completely without leaking another account's rows", async () => {
    const f = await fixture();
    await testPrisma.notification.createMany({
      data: Array.from({ length: 205 }, (_, index) => ({
        userId: f.user.id,
        type: "ACCOUNT_SECURITY_EVENT",
        title: `Private notification ${index}`,
        body: "Private notice",
        createdAt: new Date("2026-01-01"),
      })),
    });
    const other = await workflowFixture();
    await testPrisma.notification.create({
      data: {
        userId: other.user.id,
        type: "ACCOUNT_SECURITY_EVENT",
        title: "FOREIGN_NOTIFICATION",
        body: "Not yours",
      },
    });
    const body = (await exportMaskedAccount(f.actor)).toString();
    const parsed = JSON.parse(body);
    expect(parsed.notifications).toHaveLength(205);
    expect(new Set(parsed.notifications.map((row: { id: string }) => row.id)).size).toBe(
      205
    );
    expect(body).not.toContain("FOREIGN_NOTIFICATION");
  });
});
