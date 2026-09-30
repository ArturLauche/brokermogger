import { describe, expect, it } from "vitest";
import type { RequestStatus } from "@prisma/client";
import { getOwnedDashboard } from "@/lib/db/repositories/dashboard";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";

describe("dashboard scope and counts", () => {
  it("counts every waiting deadline while bounding previews and excluding completed work", async () => {
    const fixture = await workflowFixture(8);
    const now = new Date("2026-09-30T10:00:00Z");
    const jurisdiction = await testPrisma.jurisdiction.findUniqueOrThrow({
      where: { code: "DE" },
    });
    const base = {
      userId: fixture.user.id,
      profileId: fixture.profile.id,
      jurisdictionId: jurisdiction.id,
      channel: "EMAIL" as const,
      requestType: "DELETION" as const,
      legalBasisText: "Synthetic dashboard fixture",
    };
    await testPrisma.removalRequest.createMany({
      data: fixture.brokers.map((broker, index) => ({
        ...base,
        brokerId: broker.id,
        status: "WAITING_FOR_BROKER" as const,
        deadlineAt: new Date(now.getTime() + (index + 1) * 86_400_000),
      })),
    });
    for (const status of ["CLOSED", "COMPLETED", "REJECTED", "FAILED"] as const) {
      await testPrisma.removalRequest.create({
        data: {
          ...base,
          brokerId: fixture.brokers[0]!.id,
          status,
          deadlineAt: new Date("2026-10-30"),
        },
      });
    }
    const result = await getOwnedDashboard(fixture.actor, fixture.profile.id, now);
    expect(result.total).toBe(12);
    expect(result.brokerCount).toBe(8);
    expect(result.upcomingCount).toBe(8);
    expect(result.upcoming).toHaveLength(5);
    expect(
      result.upcoming.map((row) => row.deadlineAt?.toISOString().slice(0, 10))
    ).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"]);
    expect(result.byStatus.get("WAITING_FOR_BROKER")).toBe(8);
    expect(result.attention.map((row) => row.status).sort()).toEqual([
      "FAILED",
      "REJECTED",
    ]);
    expect(result.recent).toHaveLength(8);
    expect(result.recent[0]).not.toHaveProperty("includedIdentifiers");
    expect(result.recent[0]!.broker).toEqual({ legalName: expect.any(String) });
  });

  it("keeps action previews bounded without understating the real status counts", async () => {
    const fixture = await workflowFixture(8);
    const jurisdiction = await testPrisma.jurisdiction.findUniqueOrThrow({
      where: { code: "DE" },
    });
    const statuses: RequestStatus[] = [
      "DRAFT",
      "PREPARED",
      "AWAITING_USER_APPROVAL",
      "MANUAL_REVIEW_REQUIRED",
      "NO_RESPONSE",
      "NEEDS_USER_ACTION",
      "PARTIALLY_COMPLETED",
      "BROKER_REQUESTED_VERIFICATION",
    ];
    await testPrisma.removalRequest.createMany({
      data: fixture.brokers.map((broker, index) => ({
        userId: fixture.user.id,
        profileId: fixture.profile.id,
        brokerId: broker.id,
        jurisdictionId: jurisdiction.id,
        channel: "EMAIL",
        requestType: "DELETION",
        status: statuses[index]!,
        legalBasisText: "Synthetic dashboard fixture",
        deadlineAt: new Date("2026-10-31"),
      })),
    });
    const result = await getOwnedDashboard(fixture.actor, null);
    expect(result.attention).toHaveLength(5);
    expect(result.total).toBe(8);
    expect([...result.byStatus.values()].reduce((sum, count) => sum + count, 0)).toBe(8);
    expect(result.upcomingCount).toBe(0);
  });

  it("rejects a foreign profile filter, including an admin grant, and excludes all foreign rows", async () => {
    const owner = await workflowFixture();
    const stranger = await testPrisma.user.create({
      data: { email: "dashboard-stranger@example.org" },
    });
    const jurisdiction = await testPrisma.jurisdiction.findUniqueOrThrow({
      where: { code: "DE" },
    });
    await testPrisma.removalRequest.create({
      data: {
        userId: owner.user.id,
        profileId: owner.profile.id,
        brokerId: owner.brokers[0]!.id,
        jurisdictionId: jurisdiction.id,
        channel: "EMAIL",
        requestType: "DELETION",
        status: "AWAITING_USER_APPROVAL",
        legalBasisText: "Synthetic isolation fixture",
      },
    });
    const actor = testActor(stranger.id, "INSTANCE_ADMIN", {
      adminGrant: {
        adminActionId: "synthetic",
        scope: `user:${owner.user.id}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(getOwnedDashboard(actor, owner.profile.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const empty = await getOwnedDashboard(actor, null);
    expect(empty.total).toBe(0);
    expect(empty.brokerCount).toBe(0);
    expect(empty.attention).toEqual([]);
    expect(empty.upcoming).toEqual([]);
    expect(empty.recent).toEqual([]);
  });
});
