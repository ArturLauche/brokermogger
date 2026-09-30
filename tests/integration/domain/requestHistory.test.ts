import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { appendRequestEventInTx, getOwnedRequest } from "@/lib/db/repositories/requests";
import {
  getRequestAccessSummary,
  listRequestEvents,
  listRequestSubmissions,
} from "@/lib/db/repositories/requestHistory";
import { listRequestEvidenceChoices } from "@/lib/db/repositories/requestEvidence";
import { generateRequests } from "@/lib/requests/lifecycle";
import { workflowFixture } from "../../helpers/workflow";
import { testPrisma } from "../../helpers/db";
import { testActor } from "../../helpers/actor";

async function fixture() {
  const f = await workflowFixture();
  const {
    requestIds: [id],
  } = await generateRequests(f.actor, f.input);
  return { ...f, request: await getOwnedRequest(f.actor, id!) };
}

describe("bounded private request details", () => {
  it("keeps private reads owner-only and selects only operational fields for audited emergency access", async () => {
    const f = await fixture();
    const admin = await testPrisma.user.create({
      data: { email: `${randomUUID()}@example.org`, role: "INSTANCE_ADMIN" },
    });
    const actor = testActor(admin.id, "INSTANCE_ADMIN", {
      adminGrant: {
        adminActionId: "grant",
        scope: `user:${f.user.id}`,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const read = vi.spyOn(prisma.removalRequest, "findFirst");
    try {
      await expect(getOwnedRequest(actor, f.request.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(read).toHaveBeenCalledTimes(1);
      expect(read.mock.calls[0]?.[0]).toMatchObject({
        select: { id: true, userId: true },
      });
      const summary = await getRequestAccessSummary(actor, f.request.id);
      expect(summary.emergencyRead).toBe(true);
      expect(Object.keys(summary.request).sort()).toEqual(
        [
          "broker",
          "channel",
          "createdAt",
          "id",
          "jurisdiction",
          "requestType",
          "status",
          "updatedAt",
        ].sort()
      );
      for (const call of read.mock.calls) expect(call[0]).not.toHaveProperty("include");
      expect(
        await testPrisma.auditLog.count({
          where: {
            actorUserId: admin.id,
            action: "admin.user_data_viewed",
            resourceId: f.request.id,
          },
        })
      ).toBe(1);
      await expect(listRequestEvents(actor, f.request.id)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(listRequestEvidenceChoices(actor, f.request.id)).rejects.toMatchObject(
        { code: "FORBIDDEN" }
      );
    } finally {
      read.mockRestore();
    }
    expect(f.request).not.toHaveProperty("events");
    expect(f.request).not.toHaveProperty("evidenceFiles");
    expect(f.request.profile).not.toHaveProperty("legalNameEnc");
  });

  it("reaches every event and submission with stable cursors and checks submission by exact snapshot", async () => {
    const f = await fixture();
    for (let index = 0; index < 76; index++)
      await testPrisma.$transaction((tx) =>
        appendRequestEventInTx(tx, {
          removalRequestId: f.request.id,
          type: "CORRECTION",
          actorType: "USER",
          actorUserId: f.user.id,
          fromStatus: f.request.status,
          toStatus: f.request.status,
          message: `Synthetic history ${index}`,
          payload: { private: "not selected" },
        })
      );
    const first = await listRequestEvents(f.actor, f.request.id);
    expect(first.items).toHaveLength(25);
    expect(first.items[0]).not.toHaveProperty("payload");
    expect(first.items[0]).not.toHaveProperty("actorUserId");
    expect(first.items[0]).not.toHaveProperty("hash");
    const seen = first.items.map((row) => row.id);
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await listRequestEvents(f.actor, f.request.id, { cursor });
      seen.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor;
    }
    expect(new Set(seen).size).toBe(first.total);
    const snapshots = Array.from({ length: 76 }, (_, index) => ({
      id: randomUUID(),
      removalRequestId: f.request.id,
      version: index + 2,
      subject: "",
      body: "",
      contentHash: "synthetic",
      identifierDigest: "synthetic",
      variables: {},
      createdByUserId: f.user.id,
    }));
    await testPrisma.requestSnapshot.createMany({ data: snapshots });
    await testPrisma.manualSubmission.createMany({
      data: snapshots.map((snapshot) => ({
        removalRequestId: f.request.id,
        snapshotId: snapshot.id,
        submittedOn: new Date("2026-09-01"),
        recordedByUserId: f.user.id,
      })),
    });
    expect((await getOwnedRequest(f.actor, f.request.id)).currentSnapshotSubmitted).toBe(
      false
    );
    await testPrisma.manualSubmission.create({
      data: {
        removalRequestId: f.request.id,
        snapshotId: f.request.currentSnapshotId!,
        submittedOn: new Date("2026-09-01"),
        recordedByUserId: f.user.id,
      },
    });
    expect((await getOwnedRequest(f.actor, f.request.id)).currentSnapshotSubmitted).toBe(
      true
    );
    const submissions = await listRequestSubmissions(f.actor, f.request.id);
    const ids = submissions.items.map((row) => row.id);
    cursor = submissions.nextCursor;
    while (cursor) {
      const page = await listRequestSubmissions(f.actor, f.request.id, { cursor });
      ids.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor;
    }
    expect(ids).toHaveLength(77);
    expect(new Set(ids).size).toBe(77);
    await expect(
      listRequestEvents(f.actor, f.request.id, { limit: 101 })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      listRequestEvents(f.actor, f.request.id, { cursor: "damaged" })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("pages every eligible attachment while excluding foreign, expired, missing and identity files", async () => {
    const f = await fixture();
    const data = {
      userId: f.user.id,
      profileId: f.profile.id,
      removalRequestId: f.request.id,
      kind: "OTHER" as const,
      storageBackend: "memory",
      contentType: "application/pdf",
      byteSize: 100,
      checksumSha256: "b".repeat(64),
      filenameEnc: "private-cipher",
      filenameMasked: "m•••••.pdf",
    };
    const ids = Array.from({ length: 76 }, () => randomUUID());
    await testPrisma.evidenceFile.createMany({
      data: ids.map((id) => ({ id, ...data, storageKey: randomUUID() })),
    });
    const foreign = await testPrisma.user.create({
      data: { email: `${randomUUID()}@example.org` },
    });
    await testPrisma.evidenceFile.createMany({
      data: [
        { ...data, storageKey: randomUUID(), kind: "IDENTITY_DOCUMENT" },
        { ...data, storageKey: randomUUID(), expiresAt: new Date("2000-01-01") },
        { ...data, storageKey: randomUUID(), storageState: "PURGE_PENDING" },
        { ...data, storageKey: randomUUID(), userId: foreign.id },
      ],
    });
    const first = await listRequestEvidenceChoices(f.actor, f.request.id);
    expect(first.total).toBe(76);
    expect(Object.keys(first.items[0]!).sort()).toEqual(["id", "label"]);
    const seen = first.items.map((row) => row.id);
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await listRequestEvidenceChoices(f.actor, f.request.id, { cursor });
      seen.push(...page.items.map((row) => row.id));
      cursor = page.nextCursor;
    }
    expect(new Set(seen)).toEqual(new Set(ids));
    expect(
      (await listRequestEvidenceChoices(f.actor, f.request.id, { search: "absent" }))
        .total
    ).toBe(0);
    await expect(
      listRequestEvidenceChoices(testActor(foreign.id), f.request.id)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
