import { describe, expect, it } from "vitest";

import { backfillPrivatePayloads } from "@/lib/db/repositories/privacyMigration";
import { readSnapshotText } from "@/lib/requests/snapshot";
import { generateRequests } from "@/lib/requests/lifecycle";
import { decryptBytes, sha256Hex } from "@/lib/security/crypto";
import { getStorage } from "@/lib/storage";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

describe("private-payload upgrade", () => {
  it("removes accidental legal-name labels after payload migration while preserving chosen labels", async () => {
    const fixture = await workflowFixture();
    await testPrisma.userProfile.update({
      where: { id: fixture.profile.id },
      data: { displayName: "Alex Sample" },
    });
    await backfillPrivatePayloads(1);
    expect((await backfillPrivatePayloads(1)).labels).toBe(1);
    expect(
      (
        await testPrisma.userProfile.findUniqueOrThrow({
          where: { id: fixture.profile.id },
        })
      ).displayName
    ).toBe("My profile");
    expect(
      Object.values(await backfillPrivatePayloads(1)).every((count) => count === 0)
    ).toBe(true);
  });

  it("preserves snapshot identity and hashes, verifies files, and resumes without rewriting history", async () => {
    const fixture = await workflowFixture();
    const generated = await generateRequests(fixture.actor, fixture.input);
    const subject = "Private legacy request";
    const body = "Alex Sample asks about private@example.org.";
    const snapshot = await testPrisma.requestSnapshot.create({
      data: {
        removalRequestId: generated.requestIds[0]!,
        version: 2,
        subject,
        body,
        contentHash: sha256Hex(`${subject}\n${body}`),
        identifierDigest: "legacy",
      },
    });
    const rawFile = Buffer.from("%PDF-1.7 legacy personal content");
    const storage = getStorage();
    await storage.put({
      key: "legacy/test-file",
      contentType: "application/pdf",
      body: rawFile,
    });
    const file = await testPrisma.evidenceFile.create({
      data: {
        userId: fixture.user.id,
        kind: "OTHER",
        storageKey: "legacy/test-file",
        storageBackend: storage.backend,
        contentType: "application/pdf",
        byteSize: rawFile.length,
        checksumSha256: sha256Hex(rawFile),
      },
    });
    const first = await backfillPrivatePayloads();
    expect(first.snapshots).toBe(1);
    expect(first.files).toBe(1);
    const migrated = await testPrisma.requestSnapshot.findUniqueOrThrow({
      where: { id: snapshot.id },
    });
    expect(migrated.subject).toBe("");
    expect(migrated.body).toBe("");
    expect(migrated.contentHash).toBe(snapshot.contentHash);
    expect(readSnapshotText(migrated).body).toBe(body);
    expect(
      decryptBytes(await storage.get(file.storageKey), {
        table: "EvidenceFile",
        column: "object",
        recordId: file.id,
      })
    ).toEqual(rawFile);
    expect(
      Object.values(await backfillPrivatePayloads()).every((count) => count === 0)
    ).toBe(true);
    await expect(
      testPrisma.requestSnapshot.update({
        where: { id: snapshot.id },
        data: { contentHash: "changed" },
      })
    ).rejects.toThrow(/append-only/);
  });
});
