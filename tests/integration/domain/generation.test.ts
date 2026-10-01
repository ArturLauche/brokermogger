import { afterEach, describe, expect, it, vi } from "vitest";

import { prepareRequestDrafts } from "@/lib/requests/generation";
import { createPreparedDrafts } from "@/lib/db/repositories/requestGeneration";
import { updateOwnedProfile } from "@/lib/db/repositories/profiles";
import { generateRequests } from "@/lib/requests/lifecycle";
import * as renderer from "@/lib/templates/renderer";
import { workflowFixture } from "../../helpers/workflow";
import { testPrisma } from "../../helpers/db";

afterEach(() => vi.restoreAllMocks());

describe("seeded generation", () => {
  it("does not spend quota or persist a draft when its legal rule is withdrawn after rendering", async () => {
    const fixture = await workflowFixture();
    const { drafts, fairUse } = await prepareRequestDrafts(fixture.actor, fixture.input);
    const version = await testPrisma.legalRuleVersion.findUniqueOrThrow({
      where: { id: drafts[0]!.legalRuleVersionId },
    });
    await testPrisma.legalRule.update({
      where: { id: version.legalRuleId },
      data: { isActive: false },
    });
    await expect(
      createPreparedDrafts(fixture.actor, drafts, fairUse)
    ).rejects.toMatchObject({
      code: "LEGAL_RULE_UNAVAILABLE",
    });
    expect(await testPrisma.removalRequest.count()).toBe(0);
    expect(await testPrisma.rateLimitBucket.count()).toBe(0);
  });

  it("requires completed setup before generation, including the transactional recheck", async () => {
    const fixture = await workflowFixture();
    const { drafts, fairUse } = await prepareRequestDrafts(fixture.actor, fixture.input);
    await testPrisma.userProfile.update({
      where: { id: fixture.profile.id },
      data: { onboardingCompletedAt: null },
    });
    await expect(generateRequests(fixture.actor, fixture.input)).rejects.toMatchObject({
      code: "CONSENT_REQUIRED",
    });
    await expect(
      createPreparedDrafts(fixture.actor, drafts, fairUse)
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(await testPrisma.removalRequest.count()).toBe(0);
    expect(await testPrisma.rateLimitBucket.count()).toBe(0);
  });

  it.each(["FOLLOW_UP", "FINAL_REMINDER", "ESCALATION"] as const)(
    "does not allow %s to bypass the existing request workflow",
    async (requestType) => {
      const fixture = await workflowFixture();
      await expect(
        generateRequests(fixture.actor, { ...fixture.input, requestType })
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
      expect(await testPrisma.removalRequest.count()).toBe(0);
    }
  );

  it("rejects a profile change between rendering and atomic persistence", async () => {
    const fixture = await workflowFixture();
    const { drafts, fairUse } = await prepareRequestDrafts(fixture.actor, fixture.input);
    await updateOwnedProfile(fixture.actor, fixture.profile.id, {
      displayName: "My profile",
      legalName: "Alex Changed",
      contactEmail: "alex@example.org",
      countryCode: "DE",
      region: null,
      residencyConfirmed: true,
    });
    await expect(
      createPreparedDrafts(fixture.actor, drafts, fairUse)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await testPrisma.removalRequest.count()).toBe(0);
    expect(await testPrisma.rateLimitBucket.count()).toBe(0);
  });

  it("rejects a contact change after rendering before reserving quota", async () => {
    const fixture = await workflowFixture();
    const { drafts, fairUse } = await prepareRequestDrafts(fixture.actor, fixture.input);
    await testPrisma.brokerContactMethod.updateMany({
      where: { brokerId: fixture.brokers[0]!.id },
      data: { type: "POSTAL", value: "Example broker, Sample Street 1, Berlin" },
    });
    await expect(
      createPreparedDrafts(fixture.actor, drafts, fairUse)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await testPrisma.removalRequest.count()).toBe(0);
    expect(await testPrisma.rateLimitBucket.count()).toBe(0);
  });

  it("prepares a German deletion letter from shipped legal data", async () => {
    const fixture = await workflowFixture();
    const result = await generateRequests(fixture.actor, fixture.input);
    const request = await testPrisma.removalRequest.findUniqueOrThrow({
      where: { id: result.requestIds[0]! },
      include: { snapshots: true, events: true },
    });
    expect(request.status).toBe("MANUAL_REVIEW_REQUIRED");
    expect(request.snapshots).toHaveLength(1);
    expect(request.currentSnapshotId).toBe(request.snapshots[0]?.id);
    expect(request.events.length).toBeGreaterThanOrEqual(3);
    expect(request.deadlineAt).toBeNull();
  });

  it("does not write a partial batch or consume quota when rendering fails", async () => {
    const fixture = await workflowFixture(2);
    const render = renderer.renderTemplate;
    vi.spyOn(renderer, "renderTemplate")
      .mockImplementationOnce(render)
      .mockImplementationOnce(() => {
        throw new Error("Injected rendering failure");
      });
    await expect(generateRequests(fixture.actor, fixture.input)).rejects.toThrow(
      "Injected rendering failure"
    );
    expect(await testPrisma.removalRequest.count()).toBe(0);
    expect(await testPrisma.requestSnapshot.count()).toBe(0);
    expect(await testPrisma.rateLimitBucket.count()).toBe(0);
  });

  it("rolls back request rows and quota if snapshot persistence fails", async () => {
    const fixture = await workflowFixture(2);
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_reject_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected snapshot failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_reject_snapshot BEFORE INSERT ON "RequestSnapshot" FOR EACH ROW EXECUTE FUNCTION test_reject_snapshot()`
    );
    try {
      await expect(generateRequests(fixture.actor, fixture.input)).rejects.toThrow();
      expect(await testPrisma.removalRequest.count()).toBe(0);
      expect(await testPrisma.rateLimitBucket.count()).toBe(0);
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_reject_snapshot ON "RequestSnapshot"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_reject_snapshot()`);
    }
  });

  it("preserves the open-request constraint under concurrent generation without double charging", async () => {
    const fixture = await workflowFixture();
    const results = await Promise.allSettled([
      generateRequests(fixture.actor, fixture.input),
      generateRequests(fixture.actor, fixture.input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(failure?.status === "rejected" && failure.reason).toMatchObject({
      code: "CONFLICT",
    });
    expect(await testPrisma.removalRequest.count()).toBe(1);
    const buckets = await testPrisma.rateLimitBucket.findMany();
    expect(buckets.map((bucket) => bucket.count)).toEqual([1, 1]);
  });

  it("rejects a selection containing an identifier from another account", async () => {
    const fixture = await workflowFixture();
    await expect(
      generateRequests(fixture.actor, {
        ...fixture.input,
        identifierIds: [...fixture.input.identifierIds, "foreign-id"],
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await testPrisma.removalRequest.count()).toBe(0);
  });
});
