import { afterEach, describe, expect, it, vi } from "vitest";
import {
  inviteHouseholdAdult,
  decideHouseholdConsent,
  resolveConsentInvitation,
  resendHouseholdInvitation,
  revokeHouseholdConsent,
  removeHouseholdMember,
} from "@/lib/household/service";
import { getOwnedProfile, updateOwnedProfile } from "@/lib/db/repositories/profiles";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { getEmailProvider } from "@/lib/email";
import { getMockOutbox, clearMockOutbox } from "@/lib/email/providers/mock";
import { generateRequests, approveRequest } from "@/lib/requests/lifecycle";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

const profile = {
  displayName: "Household adult",
  legalName: "Morgan Sample",
  contactEmail: "morgan@example.org",
  countryCode: "DE",
  region: null,
  residencyConfirmed: true,
};
const invitation = { profile, relationship: "OTHER_ADULT", adultConfirmed: true };
const decision = {
  decision: "agree",
  adultConfirmed: true,
  residencyConfirmed: true,
  ipHash: null,
  userAgentHash: null,
};
function latestToken() {
  return /\/household\/consent\/([A-Za-z0-9_-]+)/.exec(
    getMockOutbox().at(-1)!.message.text
  )![1]!;
}
afterEach(() => {
  clearMockOutbox();
  vi.restoreAllMocks();
});
async function invited() {
  const fixture = await workflowFixture();
  const result = await inviteHouseholdAdult(fixture.actor, invitation);
  return { ...fixture, ...result, token: latestToken() };
}

describe("household consent lifecycle", () => {
  it("does not create duplicate household profiles under a repeated invitation submission", async () => {
    const fixture = await workflowFixture();
    const results = await Promise.allSettled([
      inviteHouseholdAdult(fixture.actor, invitation),
      inviteHouseholdAdult(fixture.actor, invitation),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await testPrisma.householdMember.count()).toBe(1);
    expect(await testPrisma.householdConsent.count()).toBe(1);
  });

  it("uses genuine profile fields and creates matching identifiers atomically", async () => {
    const fixture = await invited();
    expect(fixture.delivery).toBe("simulated");
    const saved = await getOwnedProfile(fixture.actor, fixture.profileId);
    expect(saved).toMatchObject({
      displayName: "Household adult",
      countryCode: "DE",
      consentStatus: "PENDING_CONSENT",
      contactEmailMasked: expect.stringContaining("@"),
    });
    expect(saved.identifiers).toHaveLength(2);
    expect(saved.legalNameEnc).not.toContain(profile.legalName);
    await expect(
      generateRequests(fixture.actor, {
        ...fixture.input,
        profileId: fixture.profileId,
        identifierIds: saved.identifiers.map((row) => row.id),
      })
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(await resolveConsentInvitation(fixture.token)).toMatchObject({
      status: "PENDING",
      countryCode: "DE",
    });
  });

  it("allows only one atomic decision when accept and decline race", async () => {
    const fixture = await invited();
    const results = await Promise.allSettled([
      decideHouseholdConsent({ ...decision, token: fixture.token }),
      decideHouseholdConsent({ ...decision, token: fixture.token, decision: "decline" }),
    ]);
    expect(results.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    const consent = await testPrisma.householdConsent.findFirstOrThrow();
    const current = await getOwnedProfile(fixture.actor, fixture.profileId);
    expect(current.consentStatus).toBe(
      consent.status === "VERIFIED" ? "EXPLICIT_CONSENT_OBTAINED" : "NOT_ALLOWED"
    );
    expect(await testPrisma.consentRecord.count()).toBe(1);
    expect(await testPrisma.notification.count()).toBe(1);
  });

  it("rolls a decision back if append-only consent proof cannot be written", async () => {
    const fixture = await invited();
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_household_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_household_failure BEFORE INSERT ON "ConsentRecord" FOR EACH ROW EXECUTE FUNCTION test_household_failure()`
    );
    try {
      await expect(
        decideHouseholdConsent({ ...decision, token: fixture.token })
      ).rejects.toThrow();
      expect((await testPrisma.householdConsent.findFirstOrThrow()).status).toBe(
        "PENDING"
      );
      expect(
        (await getOwnedProfile(fixture.actor, fixture.profileId)).consentStatus
      ).toBe("PENDING_CONSENT");
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_household_failure ON "ConsentRecord"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_household_failure()`);
    }
  });

  it("keeps failed delivery recoverable and invalidates old invitation links on resend", async () => {
    const fixture = await invited();
    vi.spyOn(getEmailProvider(), "sendEmail").mockRejectedValueOnce(
      new Error("Synthetic transport failure")
    );
    expect(
      (await resendHouseholdInvitation(fixture.actor, fixture.memberId)).delivery
    ).toBe("failed");
    expect(await resolveConsentInvitation(fixture.token)).toMatchObject({
      status: "REVOKED",
    });
    await resendHouseholdInvitation(fixture.actor, fixture.memberId);
    const newToken = latestToken();
    expect(newToken).not.toBe(fixture.token);
    await expect(
      decideHouseholdConsent({ ...decision, token: fixture.token })
    ).rejects.toMatchObject({ code: "CONSENT_INVALID" });
    await decideHouseholdConsent({ ...decision, token: newToken });
    expect(await testPrisma.householdMember.count()).toBe(1);
    expect(await resolveConsentInvitation(newToken)).toMatchObject({
      status: "VERIFIED",
    });
  });

  it("allows the represented adult to withdraw and fences a queued approval", async () => {
    const fixture = await invited();
    await decideHouseholdConsent({ ...decision, token: fixture.token });
    const current = await getOwnedProfile(fixture.actor, fixture.profileId);
    const generated = await generateRequests(fixture.actor, {
      ...fixture.input,
      profileId: fixture.profileId,
      identifierIds: current.identifiers.map((row) => row.id),
    });
    const request = await getOwnedRequest(fixture.actor, generated.requestIds[0]!);
    await approveRequest(fixture.actor, {
      requestId: request.id,
      envelopeHash: request.snapshots[0]!.envelopeHash,
      confirmationAccepted: true,
    });
    await decideHouseholdConsent({
      ...decision,
      token: fixture.token,
      decision: "revoke",
    });
    expect(
      (
        await testPrisma.backgroundJob.findFirstOrThrow({
          where: { type: "SEND_REQUEST" },
        })
      ).status
    ).toBe("CANCELLED");
    expect(
      (await getOwnedRequest(fixture.actor, request.id)).approvedEnvelopeHash
    ).toBeNull();
    expect(await resolveConsentInvitation(fixture.token)).toMatchObject({
      status: "REVOKED",
    });
  });

  it("expires unused invitations and checks ownership for management actions", async () => {
    const fixture = await invited();
    await testPrisma.householdConsent.updateMany({
      data: {
        createdAt: new Date(Date.now() - 2000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    expect(
      await decideHouseholdConsent({ ...decision, token: fixture.token })
    ).toMatchObject({ status: "EXPIRED" });
    expect(await resolveConsentInvitation(fixture.token)).toMatchObject({
      status: "EXPIRED",
    });
    const foreign = testActor("foreign");
    await expect(
      resendHouseholdInvitation(foreign, fixture.memberId)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revokeHouseholdConsent(foreign, fixture.memberId)).rejects.toMatchObject(
      { code: "FORBIDDEN" }
    );
    await expect(removeHouseholdMember(foreign, fixture.memberId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("requires fresh permission when the represented identity or residence changes", async () => {
    const fixture = await invited();
    await decideHouseholdConsent({ ...decision, token: fixture.token });
    await updateOwnedProfile(fixture.actor, fixture.profileId, {
      ...profile,
      legalName: "Another Person",
    });
    expect((await getOwnedProfile(fixture.actor, fixture.profileId)).consentStatus).toBe(
      "NOT_ALLOWED"
    );
    expect(await resolveConsentInvitation(fixture.token)).toMatchObject({
      status: "REVOKED",
    });
    await removeHouseholdMember(fixture.actor, fixture.memberId);
    expect(
      await testPrisma.profileIdentifier.count({
        where: { profileId: fixture.profileId },
      })
    ).toBe(0);
    expect(await resolveConsentInvitation(fixture.token)).toBeNull();
  });
});
