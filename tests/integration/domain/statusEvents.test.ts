/**
 * Status writes append the hash-chained event in the same transaction, and
 * pending follow-up jobs are cancelled when the request is closed.
 */
import { describe, expect, it } from "vitest";

import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { insertJob, findJobByIdempotency } from "@/lib/db/repositories/jobs";
import { createSelfProfile } from "@/lib/db/repositories/profiles";
import { applyRequestStatus } from "@/lib/db/repositories/requests";

async function seedDraftRequest(userId: string) {
  const actor = testActor(userId);
  const profile = await createSelfProfile(actor, {
    displayName: "Ada Owner",
    legalName: "Ada Owner",
    countryCode: "DE",
    region: null,
    residencyConfirmed: true,
    contactEmail: "owner@example.org",
  });
  const jurisdiction = await testPrisma.jurisdiction.create({
    data: { code: "DE-TEST", name: "Test", countryCode: "DE", isActive: true },
  });
  const broker = await testPrisma.broker.create({
    data: {
      slug: "status-event-broker",
      legalName: "Status Event Broker GmbH",
      category: "PEOPLE_SEARCH",
      isDemoData: true,
      productionSendingEnabled: false,
    },
  });
  return testPrisma.removalRequest.create({
    data: {
      userId,
      profileId: profile.id,
      brokerId: broker.id,
      jurisdictionId: jurisdiction.id,
      requestType: "DELETION",
      channel: "EMAIL",
      status: "DRAFT",
      legalBasisText: "Test",
    },
  });
}

describe("applyRequestStatus", () => {
  it("writes the new status and the STATUS_CHANGE event together", async () => {
    const user = await testPrisma.user.create({
      data: { email: "status-event@example.org" },
      select: { id: true },
    });
    const request = await seedDraftRequest(user.id);

    await applyRequestStatus(testActor(user.id), {
      requestId: request.id,
      from: "DRAFT",
      to: "PREPARED",
      message: "Draft rendered from the published template.",
    });

    const row = await testPrisma.removalRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: { events: { orderBy: { createdAt: "asc" } } },
    });

    expect(row.status).toBe("PREPARED");
    expect(row.events).toHaveLength(1);
    expect(row.events[0]?.type).toBe("STATUS_CHANGE");
    expect(row.events[0]?.fromStatus).toBe("DRAFT");
    expect(row.events[0]?.toStatus).toBe("PREPARED");
    expect(row.events[0]?.hash).toBeTruthy();
  });

  it("cancels pending recheck jobs when the request is closed", async () => {
    const user = await testPrisma.user.create({
      data: { email: "status-cancel@example.org" },
      select: { id: true },
    });
    const request = await seedDraftRequest(user.id);
    await insertJob({
      type: "RECHECK_REMINDER",
      payload: { removalRequestId: request.id },
      idempotencyKey: `recheck:${request.id}`,
      relatedRequestId: request.id,
    });

    await applyRequestStatus(testActor(user.id), {
      requestId: request.id,
      from: "DRAFT",
      to: "CLOSED",
      message: "Closed by the account holder.",
      cancelPendingJobTypes: ["RECHECK_REMINDER", "PREPARE_FOLLOW_UP", "SEND_REQUEST"],
    });

    const job = await findJobByIdempotency(`recheck:${request.id}`);
    expect(job?.status).toBe("CANCELLED");
    const row = await testPrisma.removalRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(row.status).toBe("CLOSED");
  });
});
