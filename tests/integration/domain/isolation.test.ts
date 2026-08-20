/**
 * Ownership isolation, consent gates and job idempotency against PostgreSQL.
 */
import { describe, expect, it } from "vitest";

import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import {
  getOwnedProfile,
  createSelfProfile,
  addIdentifier,
} from "@/lib/db/repositories/profiles";
import { generateRequests } from "@/lib/requests/lifecycle";
import { isAppError } from "@/lib/core/errors";
import { evaluateConsent } from "@/lib/consent/status";
import { insertJob, findJobByIdempotency } from "@/lib/db/repositories/jobs";
import { seedJurisdictions } from "@/prisma/seeds/jurisdictions";
import { seedLegalRules } from "@/prisma/seeds/legalRules";
import { seedRequestTemplates } from "@/prisma/seeds/templates";
import { seedBrokers } from "@/prisma/seeds/brokers";
import { ForbiddenError } from "@/lib/core/errors";

async function createUser(email: string): Promise<string> {
  const user = await testPrisma.user.create({ data: { email }, select: { id: true } });
  return user.id;
}

describe("ownership isolation", () => {
  it("refuses another account's profile and request", async () => {
    const ownerId = await createUser("owner@example.org");
    const strangerId = await createUser("stranger@example.org");
    const owner = testActor(ownerId);
    const stranger = testActor(strangerId);

    const profile = await createSelfProfile(owner, {
      displayName: "Ada Owner",
      legalName: "Ada Owner",
      countryCode: "DE",
      region: null,
      residencyConfirmed: true,
      contactEmail: "owner@example.org",
    });

    await expect(getOwnedProfile(stranger, profile.id)).rejects.toBeInstanceOf(
      ForbiddenError
    );

    const jurisdiction = await testPrisma.jurisdiction.create({
      data: { code: "XX", name: "Test", countryCode: "XX", isActive: true },
    });
    const broker = await testPrisma.broker.create({
      data: {
        slug: "test-broker",
        legalName: "Test Broker GmbH",
        category: "PEOPLE_SEARCH",
        isDemoData: true,
        productionSendingEnabled: false,
      },
    });
    const request = await testPrisma.removalRequest.create({
      data: {
        userId: ownerId,
        profileId: profile.id,
        brokerId: broker.id,
        jurisdictionId: jurisdiction.id,
        requestType: "DELETION",
        channel: "EMAIL",
        status: "DRAFT",
        legalBasisText: "Test",
      },
    });

    await expect(getOwnedRequest(stranger, request.id)).rejects.toBeInstanceOf(
      ForbiddenError
    );
    const owned = await getOwnedRequest(owner, request.id);
    expect(owned.id).toBe(request.id);
  });
});

describe("consent gate", () => {
  it("blocks household adults until the invitation is verified", async () => {
    expect(
      evaluateConsent({
        profileId: "p",
        kind: "HOUSEHOLD_ADULT",
        consentStatus: "PENDING_CONSENT",
        consentVerifiedAt: null,
      }).allowed
    ).toBe(false);

    const ownerId = await createUser("household@example.org");
    const actor = testActor(ownerId);
    const profile = await createSelfProfile(actor, {
      displayName: "Household Owner",
      legalName: "Household Owner",
      countryCode: "DE",
      region: null,
      residencyConfirmed: true,
      contactEmail: "household@example.org",
    });
    await testPrisma.userProfile.update({
      where: { id: profile.id },
      data: { kind: "HOUSEHOLD_ADULT", consentStatus: "PENDING_CONSENT" },
    });
    await addIdentifier(actor, profile.id, {
      type: "EMAIL",
      value: "household@example.org",
    });

    await seedJurisdictions(testPrisma);
    await seedLegalRules(testPrisma);
    await seedRequestTemplates(testPrisma);
    await seedBrokers(testPrisma);
    const broker = await testPrisma.broker.findFirstOrThrow({ select: { id: true } });
    const identifier = await testPrisma.profileIdentifier.findFirstOrThrow({
      where: { profileId: profile.id },
    });

    try {
      await generateRequests(actor, {
        profileId: profile.id,
        brokerIds: [broker.id],
        requestType: "DELETION",
        identifierIds: [identifier.id],
      });
      throw new Error("Expected consent to block generation");
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.code).toBe("CONSENT_REQUIRED");
      }
    }
  });
});

describe("job idempotency", () => {
  it("inserts a send job only once for the same key", async () => {
    const first = await insertJob({
      type: "SEND_REQUEST",
      payload: { removalRequestId: "r1", snapshotId: "s1", attempt: 1 },
      idempotencyKey: "send:r1:s1:1",
    });
    const second = await insertJob({
      type: "SEND_REQUEST",
      payload: { removalRequestId: "r1", snapshotId: "s1", attempt: 1 },
      idempotencyKey: "send:r1:s1:1",
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    const row = await findJobByIdempotency("send:r1:s1:1");
    expect(row?.id).toBe(first.id);
  });
});
