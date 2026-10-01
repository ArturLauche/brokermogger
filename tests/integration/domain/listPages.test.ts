import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { listOwnedRequests } from "@/lib/db/repositories/requests";
import { listOwnedEvidence } from "@/lib/db/repositories/evidence";
import { listAdminAudit, listAdminJobs } from "@/lib/db/repositories/admin";
import { recordAuditOrThrow } from "@/lib/audit/service";
import {
  listBrokersForDirectory,
  getSelectedBrokersForChoice,
} from "@/lib/db/repositories/catalog";
import { workflowFixture } from "../../helpers/workflow";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";

describe("complete, minimized result pages", () => {
  it("finds catalogue entries beyond the former 500-row ceiling and keeps selected choices independent of the page", async () => {
    const ids = Array.from({ length: 551 }, () => randomUUID());
    await testPrisma.broker.createMany({
      data: ids.map((id, index) => ({
        id,
        slug: `paged-${index}`,
        legalName: `Paged broker ${index}`,
        category: "PEOPLE_SEARCH" as const,
      })),
    });
    const first = await listBrokersForDirectory();
    expect(first.items).toHaveLength(25);
    expect(first.total).toBe(551);
    const seen = new Set(first.items.map((row) => row.id));
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await listBrokersForDirectory({ cursor });
      for (const row of page.items) seen.add(row.id);
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(new Set(ids));
    const last = ids.at(-1)!;
    expect(
      (await listBrokersForDirectory({ search: "Paged broker 550" })).items.map(
        (row) => row.id
      )
    ).toEqual([last]);
    expect((await getSelectedBrokersForChoice([last])).map((row) => row.id)).toEqual([
      last,
    ]);
    expect(first.items[0]).not.toHaveProperty("contactMethods");
    expect(first.items[0]).not.toHaveProperty("notes");
  });
  it("reaches every owned request past 100 rows without duplicates, even when newer requests arrive", async () => {
    const f = await workflowFixture();
    const jurisdiction = await testPrisma.jurisdiction.findUniqueOrThrow({
      where: { code: "DE" },
    });
    const base = {
      userId: f.user.id,
      profileId: f.profile.id,
      brokerId: f.brokers[0]!.id,
      jurisdictionId: jurisdiction.id,
      requestType: "DELETION" as const,
      channel: "EMAIL" as const,
      status: "COMPLETED" as const,
      legalBasisText: "Synthetic listing fixture",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    const ids = Array.from({ length: 126 }, () => randomUUID());
    await testPrisma.removalRequest.createMany({
      data: ids.map((id) => ({ id, ...base })),
    });
    const first = await listOwnedRequests(f.actor, f.profile.id);
    expect(first.items).toHaveLength(25);
    expect(first.nextCursor).toBeTruthy();
    expect(first.items[0]).not.toHaveProperty("profile");
    expect(first.items[0]).not.toHaveProperty("includedIdentifiers");
    expect(first.items[0]).not.toHaveProperty("destinationValue");
    await testPrisma.removalRequest.create({ data: { ...base, createdAt: new Date() } });
    const seen = first.items.map((row) => row.id);
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await listOwnedRequests(f.actor, f.profile.id, { cursor });
      seen.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(ids.length);
    expect(new Set(seen)).toEqual(new Set(ids));
    expect(
      (await listOwnedRequests(f.actor, f.profile.id, { status: "FAILED" })).items
    ).toEqual([]);
    expect(
      (await listOwnedRequests(f.actor, f.profile.id, { search: "Example broker" })).items
    ).toHaveLength(25);
    expect(
      (await listOwnedRequests(f.actor, f.profile.id, { limit: 100 })).items
    ).toHaveLength(100);
    await expect(
      listOwnedRequests(f.actor, f.profile.id, { limit: 101 })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      listOwnedRequests(f.actor, f.profile.id, { cursor: "broken" })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const other = await testPrisma.user.create({
      data: { email: "other-list@example.org" },
    });
    expect(
      (
        await listOwnedRequests(testActor(other.id), f.profile.id, {
          cursor: first.nextCursor!,
        })
      ).items
    ).toEqual([]);
  });

  it("pages evidence without exposing ciphertext, keys or private filenames and keeps expiry explicit", async () => {
    const f = await workflowFixture();
    await testPrisma.evidenceFile.createMany({
      data: Array.from({ length: 126 }, (_, index) => ({
        userId: f.user.id,
        profileId: index % 2 ? f.profile.id : null,
        kind: "OTHER" as const,
        storageKey: randomUUID(),
        storageBackend: "memory",
        contentType: "application/pdf",
        byteSize: 100,
        checksumSha256: "a".repeat(64),
        filenameEnc: "never-list-private-ciphertext",
        filenameMasked: "s•••••.pdf",
        expiresAt: index === 0 ? new Date("2000-01-01") : null,
      })),
    });
    const ids = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await listOwnedEvidence(
        f.actor,
        f.profile.id,
        cursor ? { cursor } : {}
      );
      for (const row of page.items) ids.add(row.id);
      expect(JSON.stringify(page)).not.toContain("never-list-private-ciphertext");
      expect(page.items[0]).not.toHaveProperty("storageKey");
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids.size).toBe(126);
    expect(
      (await listOwnedEvidence(f.actor, f.profile.id, { expiry: "expired" })).items
    ).toHaveLength(1);
    expect(
      (await listOwnedEvidence(f.actor, f.profile.id, { kind: "SCREENSHOT" })).items
    ).toEqual([]);
    const other = await testPrisma.user.create({
      data: { email: "other-evidence-list@example.org" },
    });
    expect((await listOwnedEvidence(testActor(other.id), f.profile.id)).items).toEqual(
      []
    );
  });

  it("makes all jobs and audit rows reachable while excluding operational payloads and audit metadata", async () => {
    const user = await testPrisma.user.create({
      data: { email: "list-operator@example.org", role: "INSTANCE_ADMIN" },
    });
    const actor = testActor(user.id, "INSTANCE_ADMIN");
    await testPrisma.backgroundJob.createMany({
      data: Array.from({ length: 126 }, () => ({
        type: "RETENTION_SWEEP" as const,
        status: "FAILED" as const,
        payloadJson: { privateExample: "never-list-private-payload" },
        idempotencyKey: randomUUID(),
      })),
    });
    const jobIds = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await listAdminJobs(actor, cursor ? { cursor } : {});
      for (const row of page.items) jobIds.add(row.id);
      expect(JSON.stringify(page)).not.toContain("never-list-private-payload");
      cursor = page.nextCursor;
    } while (cursor);
    expect(jobIds.size).toBe(126);
    expect((await listAdminJobs(actor, { status: "RUNNING" })).items).toEqual([]);
    for (let i = 0; i < 152; i += 1)
      await recordAuditOrThrow({
        actor,
        action: "admin.console_accessed",
        resourceType: "instance",
        metadata: { privateExample: "never-list-private-metadata" },
      });
    const auditIds = new Set<string>();
    cursor = null;
    do {
      const page = await listAdminAudit(actor, cursor ? { cursor } : {});
      for (const row of page.items) {
        auditIds.add(row.id);
        expect(row).not.toHaveProperty("metadata");
        expect(row).not.toHaveProperty("actorUserId");
      }
      cursor = page.nextCursor;
    } while (cursor);
    expect(auditIds.size).toBe(152);
    await expect(listAdminAudit(actor, { cursor: "invalid" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(listAdminJobs(testActor(user.id))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
