import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { saveOnboardingRecord } from "@/lib/db/repositories/onboarding";
import { identifierInputSchema, profileInputSchema } from "@/lib/profiles/validation";
import { saveOnboardingProfile } from "@/lib/profiles/onboarding";
import { listConsentRecordsForProfile } from "@/lib/db/repositories/household";
import {
  getOwnedProfile,
  updateOwnedIdentifier,
  updateOwnedProfile,
} from "@/lib/db/repositories/profiles";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { decryptField } from "@/lib/security/crypto";
import { approveRequest, generateRequests } from "@/lib/requests/lifecycle";
import { editRequestDraft } from "@/lib/requests/editing";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

afterEach(() => vi.restoreAllMocks());

const profileInput = {
  displayName: "My profile",
  legalName: "Alex Sample",
  countryCode: "US",
  region: "California",
  residencyConfirmed: true,
  contactEmail: "alex@example.org",
};
const input = {
  profileId: null,
  profile: profileInput,
  identifiers: [{ type: "EMAIL", value: "other@example.org" }],
  complete: false,
};
async function account() {
  const user = await testPrisma.user.create({ data: { email: "owner@example.org" } });
  return testActor(user.id);
}

describe("resumable profile setup and editing", () => {
  it("bounds direct repository batches and preserves deduplicated matching details", async () => {
    const actor = await account();
    const profile = profileInputSchema.parse(profileInput);
    const identifier = identifierInputSchema.parse({
      type: "EMAIL",
      value: "other@example.org",
    });
    await expect(
      saveOnboardingRecord(actor, {
        profileId: null,
        profile,
        identifiers: Array(31).fill(identifier),
        complete: false,
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await testPrisma.userProfile.count()).toBe(0);
    await saveOnboardingRecord(actor, {
      profileId: null,
      profile,
      identifiers: Array(30).fill(identifier),
      complete: false,
    });
    expect(await testPrisma.profileIdentifier.count()).toBe(3);
  });

  it("audits a granted consent summary before querying only its permitted fields", async () => {
    const owner = await account();
    const saved = await saveOnboardingProfile(owner, { ...input, complete: true });
    const operator = await testPrisma.user.create({
      data: { email: "consent-operator@example.org", role: "INSTANCE_ADMIN" },
    });
    const actor = testActor(operator.id, "INSTANCE_ADMIN", {
      adminGrant: {
        adminActionId: "synthetic-grant",
        scope: `user:${owner.userId}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const reads = vi.spyOn(prisma.consentRecord, "findMany");
    const result = await listConsentRecordsForProfile(actor, saved.profileId);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      statementText: "Restricted consent proof",
      evidenceJson: {},
    });
    const forbidden = [
      "statementText",
      "statementHash",
      "evidenceJson",
      "prevHash",
      "hash",
      "actorUserId",
    ];
    for (const [query] of reads.mock.calls) {
      expect(query?.select).toBeDefined();
      for (const field of forbidden) expect(query?.select).not.toHaveProperty(field);
    }
    expect(
      await testPrisma.auditLog.count({
        where: { action: "admin.user_data_viewed", resourceId: saved.profileId },
      })
    ).toBe(1);
    reads.mockClear();
    await testPrisma.user.update({
      where: { id: owner.userId },
      data: { status: "PENDING_DELETION" },
    });
    await expect(
      listConsentRecordsForProfile(owner, saved.profileId)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(reads).not.toHaveBeenCalled();
  });

  it("does not query another owner's consent proof when mandatory auditing fails", async () => {
    const owner = await account();
    const saved = await saveOnboardingProfile(owner, { ...input, complete: true });
    const operator = await testPrisma.user.create({
      data: { email: "consent-operator@example.org", role: "INSTANCE_ADMIN" },
    });
    const actor = testActor(operator.id, "INSTANCE_ADMIN", {
      adminGrant: {
        adminActionId: "synthetic-grant",
        scope: `user:${owner.userId}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const reads = vi.spyOn(prisma.consentRecord, "findMany");
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_reject_consent_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'admin.user_data_viewed' THEN RAISE EXCEPTION 'Injected mandatory audit failure'; END IF; RETURN NEW; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_reject_consent_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION test_reject_consent_audit()`
    );
    try {
      await expect(listConsentRecordsForProfile(actor, saved.profileId)).rejects.toThrow(
        /audit failure/
      );
      expect(reads).not.toHaveBeenCalled();
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_reject_consent_audit ON "AuditLog"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_reject_consent_audit()`);
    }
  });

  it("resumes the same profile and atomically completes once under concurrent submission", async () => {
    const actor = await account();
    const saved = await saveOnboardingProfile(actor, input);
    expect(saved.completed).toBe(false);
    expect(await testPrisma.consentRecord.count()).toBe(0);
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        saveOnboardingProfile(actor, {
          ...input,
          profileId: saved.profileId,
          complete: true,
        })
      )
    );
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await testPrisma.userProfile.count()).toBe(1);
    expect(await testPrisma.consentRecord.count()).toBe(1);
    expect(await testPrisma.profileIdentifier.count()).toBe(3);
    expect(await getOwnedProfile(actor, saved.profileId)).toMatchObject({
      region: "CA",
      onboardingCompletedAt: expect.any(Date),
    });
  });

  it("rolls back all setup records if consent persistence fails", async () => {
    const actor = await account();
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_onboarding_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_onboarding_failure BEFORE INSERT ON "ConsentRecord" FOR EACH ROW EXECUTE FUNCTION test_onboarding_failure()`
    );
    try {
      await expect(
        saveOnboardingProfile(actor, { ...input, complete: true })
      ).rejects.toThrow();
      expect(await testPrisma.userProfile.count()).toBe(0);
      expect(await testPrisma.profileIdentifier.count()).toBe(0);
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_onboarding_failure ON "ConsentRecord"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_onboarding_failure()`);
    }
  });

  it("validates real residency, addresses and ownership, including consent history", async () => {
    const actor = await account();
    await expect(
      saveOnboardingProfile(actor, {
        ...input,
        profile: { ...profileInput, region: "Imaginary" },
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      saveOnboardingProfile(actor, {
        ...input,
        identifiers: [{ type: "EMAIL", value: "invalid" }],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const saved = await saveOnboardingProfile(actor, input);
    await expect(
      saveOnboardingProfile(actor, { ...input, profileId: "foreign-profile" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      listConsentRecordsForProfile(testActor("foreign"), saved.profileId)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await testPrisma.user.update({
      where: { id: actor.userId },
      data: { status: "PENDING_DELETION" },
    });
    await expect(saveOnboardingProfile(actor, input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("synchronizes primary identifiers on profile edits and prevents stale approval or text resealing", async () => {
    const fixture = await workflowFixture();
    const result = await generateRequests(fixture.actor, fixture.input);
    const request = await getOwnedRequest(fixture.actor, result.requestIds[0]!);
    await updateOwnedProfile(fixture.actor, fixture.profile.id, {
      ...profileInput,
      countryCode: "DE",
      region: null,
      legalName: "Alex Changed",
      contactEmail: "changed@example.org",
    });
    const profile = await getOwnedProfile(fixture.actor, fixture.profile.id);
    expect(
      profile.identifiers.find((row) => row.id === fixture.identifier.id)?.valueBi
    ).not.toBe(fixture.identifier.valueBi);
    expect(
      decryptField(profile.legalNameEnc!, {
        table: "UserProfile",
        column: "legalNameEnc",
        recordId: profile.id,
      })
    ).toBe("Alex Changed");
    expect(profile.displayName).toBe("My profile");
    await expect(
      approveRequest(fixture.actor, {
        requestId: request.id,
        envelopeHash: request.snapshots[0]!.envelopeHash,
        confirmationAccepted: true,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      editRequestDraft(fixture.actor, {
        requestId: request.id,
        previousSnapshotId: request.currentSnapshotId,
        subject: request.snapshots[0]!.subject,
        body: request.snapshots[0]!.body,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      updateOwnedIdentifier(fixture.actor, fixture.identifier.id, {
        type: "EMAIL",
        value: "elsewhere@example.org",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      updateOwnedProfile(testActor("foreign"), profile.id, profileInput)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
