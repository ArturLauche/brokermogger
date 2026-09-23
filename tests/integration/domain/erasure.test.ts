import { afterEach, describe, expect, it, vi } from "vitest";

import { requestAccountDeletion } from "@/lib/account/service";
import {
  anonymiseDeletedAccount,
  finishAccountErasure,
  listAccountFilesForErasure,
} from "@/lib/db/repositories/account";
import { appendConsentRecord } from "@/lib/db/repositories/consent";
import { uploadEvidence } from "@/lib/evidence/service";
import { systemActor } from "@/lib/permissions/actor";
import { generateRequests } from "@/lib/requests/lifecycle";
import { getStorage, setStorageForTests } from "@/lib/storage";
import { purgePrivateFile } from "@/lib/storage/privateFiles";
import { workflowFixture } from "../../helpers/workflow";
import { testPrisma } from "../../helpers/db";
import {
  addIdentifier,
  softDeleteIdentifier,
  softDeleteProfile,
} from "@/lib/db/repositories/profiles";

afterEach(() => {
  vi.restoreAllMocks();
  setStorageForTests();
});

describe("account erasure", () => {
  it("erases an identifier and affected message copies, and permits adding the value again", async () => {
    const fixture = await workflowFixture();
    await generateRequests(fixture.actor, fixture.input);
    await softDeleteIdentifier(fixture.actor, fixture.identifier.id);
    expect(
      (
        await testPrisma.userProfile.findUniqueOrThrow({
          where: { id: fixture.profile.id },
        })
      ).contactEmailEnc
    ).toBeNull();
    expect(await testPrisma.profileIdentifier.count()).toBe(0);
    expect(await testPrisma.requestSnapshot.count()).toBe(0);
    await expect(
      addIdentifier(fixture.actor, fixture.profile.id, {
        type: "EMAIL",
        value: "alex@example.org",
      })
    ).resolves.toBeTruthy();
    await softDeleteProfile(fixture.actor, fixture.profile.id);
    expect(await testPrisma.profileIdentifier.count()).toBe(0);
    const profile = await testPrisma.userProfile.findUniqueOrThrow({
      where: { id: fixture.profile.id },
    });
    expect(profile.legalNameEnc).toBeNull();
    expect(profile.contactEmailBi).toBeNull();
  });

  it("blocks access atomically and erases recoverable payloads while retaining consent proof", async () => {
    const fixture = await workflowFixture();
    await generateRequests(fixture.actor, fixture.input);
    const file = await uploadEvidence(fixture.actor, {
      kind: "OTHER",
      requestId: null,
      filename: "private.pdf",
      contentType: "application/pdf",
      body: Buffer.from("%PDF-1.7 private content"),
    });
    await appendConsentRecord({
      profileId: fixture.profile.id,
      actorUserId: fixture.user.id,
      purpose: "PROFILE_MANAGEMENT",
      method: "SELF_ATTESTATION",
      status: "SELF",
      statementText: "I consent to managing my privacy requests.",
    });
    await testPrisma.session.create({
      data: {
        userId: fixture.user.id,
        sessionToken: "synthetic",
        expires: new Date(Date.now() + 60_000),
      },
    });
    await testPrisma.backgroundJob.create({
      data: {
        type: "SEND_REQUEST",
        relatedUserId: fixture.user.id,
        idempotencyKey: "queued-send",
      },
    });
    await requestAccountDeletion(fixture.actor);
    expect(
      (await testPrisma.user.findUniqueOrThrow({ where: { id: fixture.user.id } })).status
    ).toBe("PENDING_DELETION");
    expect(await testPrisma.session.count()).toBe(0);
    expect(
      (
        await testPrisma.backgroundJob.findUniqueOrThrow({
          where: { idempotencyKey: "queued-send" },
        })
      ).status
    ).toBe("CANCELLED");
    expect(
      await testPrisma.backgroundJob.count({
        where: { type: "DELETE_ACCOUNT_DATA", status: "PENDING" },
      })
    ).toBe(1);

    const worker = systemActor("erase-test");
    await anonymiseDeletedAccount(worker, fixture.user.id);
    expect(await testPrisma.profileIdentifier.count()).toBe(0);
    expect(await testPrisma.requestSnapshot.count()).toBe(0);
    expect(await testPrisma.consentRecord.count()).toBe(1);
    await expect(finishAccountErasure(worker, fixture.user.id)).rejects.toThrow(
      /await deletion/
    );
    for (const pending of await listAccountFilesForErasure(fixture.user.id))
      await purgePrivateFile(pending);
    await finishAccountErasure(worker, fixture.user.id);
    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: fixture.user.id },
    });
    expect(user.status).toBe("DELETED");
    expect(user.emailEnc).toBeNull();
    expect(user.emailBi).toBeNull();
    const profile = await testPrisma.userProfile.findUniqueOrThrow({
      where: { id: fixture.profile.id },
    });
    expect(profile.legalNameEnc).toBeNull();
    expect(profile.contactEmailEnc).toBeNull();
    expect(profile.legalNameBi).toBeNull();
    expect(profile.contactEmailBi).toBeNull();
    expect(await getStorage(file.storageBackend).exists(file.storageKey)).toBe(false);
    // Resuming a completed purge is harmless.
    await anonymiseDeletedAccount(worker, fixture.user.id);
    await finishAccountErasure(worker, fixture.user.id);
  });

  it("does not block access without scheduling cleanup when the queue write fails", async () => {
    const fixture = await workflowFixture();
    await testPrisma.session.create({
      data: {
        userId: fixture.user.id,
        sessionToken: "keep-until-atomic-commit",
        expires: new Date(Date.now() + 60_000),
      },
    });
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_reject_purge_job() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type = 'DELETE_ACCOUNT_DATA' THEN RAISE EXCEPTION 'Injected queue failure'; END IF; RETURN NEW; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_reject_purge_job BEFORE INSERT ON "BackgroundJob" FOR EACH ROW EXECUTE FUNCTION test_reject_purge_job()`
    );
    try {
      await expect(requestAccountDeletion(fixture.actor)).rejects.toThrow();
      expect(
        (await testPrisma.user.findUniqueOrThrow({ where: { id: fixture.user.id } }))
          .status
      ).toBe("ACTIVE");
      expect(await testPrisma.session.count()).toBe(1);
      expect(await testPrisma.backgroundJob.count()).toBe(0);
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_reject_purge_job ON "BackgroundJob"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_reject_purge_job()`);
    }
  });
});
