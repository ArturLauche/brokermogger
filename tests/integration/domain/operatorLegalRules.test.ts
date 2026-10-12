import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createLegalRule,
  startLegalDraft,
  saveLegalDraft,
  publishLegalRule,
  deactivateLegalRule,
} from "@/lib/admin/legalRules";
import {
  createLegalRuleRecord,
  getLegalVersionAdministration,
  getLegalRuleAdministration,
  listLegalRuleAdministration,
  updateLegalRuleMetadata,
} from "@/lib/db/repositories/adminLegalRules";
import {
  invalidateCatalogCache,
  listPublishedLegalRules,
} from "@/lib/db/repositories/catalog";
import { legalSourceFromVersion, prepareLegalSource } from "@/lib/jurisdiction/authoring";
import { seedJurisdictions } from "@/prisma/seeds/jurisdictions";
import { seedLegalRules } from "@/prisma/seeds/legalRules";
import { generateRequests } from "@/lib/requests/lifecycle";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";
import { workflowFixture } from "../../helpers/workflow";
import { syntheticLegalSource } from "../../helpers/legalSource";

async function fixture() {
  await seedJurisdictions(testPrisma);
  const jurisdiction = await testPrisma.jurisdiction.findUniqueOrThrow({
    where: { code: "DE" },
  });
  const user = await testPrisma.user.create({
    data: { role: "MAINTAINER", email: "legal-" + randomUUID() + "@example.org" },
  });
  return {
    actor: testActor(user.id, "MAINTAINER"),
    command: {
      lawName: "Synthetic integration rule",
      shortName: "Synthetic rule",
      description: "Fixture only",
      key: "operator.test",
      jurisdictionId: jurisdiction.id,
      ...syntheticLegalSource(),
    },
  };
}
async function scope(legalRuleId: string, versionId?: string) {
  const row = await testPrisma.legalRule.findUniqueOrThrow({
    where: { id: legalRuleId },
  });
  return {
    legalRuleId,
    ...(versionId ? { versionId } : {}),
    expectedUpdatedAt: row.updatedAt.toISOString(),
  };
}
async function publish(
  actor: ReturnType<typeof testActor>,
  result: { legalRuleId: string; versionId: string }
) {
  const row = await testPrisma.legalRuleVersion.findUniqueOrThrow({
    where: { id: result.versionId },
  });
  return publishLegalRule(actor, {
    ...(await scope(result.legalRuleId, result.versionId)),
    checksum: prepareLegalSource(legalSourceFromVersion(row)).checksum,
    reviewed: "yes",
  });
}
describe("operator legal rule authoring", () => {
  it("does not reactivate a withdrawn current version when publishing a future successor", async () => {
    const f = await fixture();
    const first = await createLegalRule(f.actor, f.command);
    await publish(f.actor, first);
    await deactivateLegalRule(f.actor, await scope(first.legalRuleId));
    const next = await startLegalDraft(
      f.actor,
      await scope(first.legalRuleId, first.versionId)
    );
    await saveLegalDraft(f.actor, {
      ...f.command,
      ...(await scope(next.legalRuleId, next.versionId)),
      effectiveFrom: new Date().getUTCFullYear() + 1 + "-01-01T00:00:00.000Z",
    });
    await publish(f.actor, next);
    expect(await listPublishedLegalRules()).toHaveLength(0);
    expect(
      (
        await testPrisma.legalRuleVersion.findUniqueOrThrow({
          where: { id: first.versionId },
        })
      ).status
    ).toBe("ARCHIVED");
    expect(
      (
        await testPrisma.legalRuleVersion.findUniqueOrThrow({
          where: { id: next.versionId },
        })
      ).status
    ).toBe("PUBLISHED");
  });
  it("checks current authority and binds every version input to its parent", async () => {
    const f = await fixture();
    await expect(
      createLegalRuleRecord({ ...f.actor, role: "USER" }, f.command)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      listLegalRuleAdministration({ ...f.actor, role: "USER" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const first = await createLegalRule(f.actor, f.command);
    const other = await createLegalRule(f.actor, { ...f.command, key: "operator.other" });
    await expect(
      getLegalVersionAdministration(f.actor, {
        legalRuleId: first.legalRuleId,
        versionId: other.versionId,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      saveLegalDraft(f.actor, {
        ...f.command,
        ...(await scope(first.legalRuleId, other.versionId)),
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await testPrisma.user.update({
      where: { id: f.actor.userId },
      data: { role: "USER" },
    });
    await expect(
      createLegalRuleRecord(f.actor, { ...f.command, key: "operator.demoted" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      startLegalDraft(f.actor, await scope(first.legalRuleId, first.versionId))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await testPrisma.user.update({
      where: { id: f.actor.userId },
      data: { role: "MAINTAINER", status: "PENDING_DELETION" },
    });
    await expect(publish(f.actor, first)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("keeps drafts inactive and requires reviewed, saved source before publication", async () => {
    const f = await fixture();
    const result = await createLegalRule(f.actor, { ...f.command, changeNotes: "" });
    expect(await listPublishedLegalRules()).toHaveLength(0);
    await expect(publish(f.actor, result)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await saveLegalDraft(f.actor, {
      ...f.command,
      ...(await scope(result.legalRuleId, result.versionId)),
    });
    await expect(
      publishLegalRule(f.actor, {
        ...(await scope(result.legalRuleId, result.versionId)),
        checksum: prepareLegalSource(f.command).checksum,
        reviewed: "",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await publish(f.actor, result);
    expect((await listPublishedLegalRules())[0]!.legalRuleVersionId).toBe(
      result.versionId
    );
    expect(
      await testPrisma.auditLog.count({
        where: { action: "admin.legal_rule_version_published" },
      })
    ).toBe(1);
  });
  it("rejects stale edits, altered previews, duplicate keys and competing draft creation", async () => {
    const f = await fixture();
    const result = await createLegalRule(f.actor, f.command);
    const stale = await scope(result.legalRuleId, result.versionId);
    const checksum = prepareLegalSource(f.command).checksum;
    await saveLegalDraft(f.actor, {
      ...f.command,
      ...stale,
      riskNotes: f.command.riskNotes + " Changed scope.",
    });
    await expect(
      updateLegalRuleMetadata(f.actor, {
        ...stale,
        lawName: "Stale",
        shortName: "Stale",
        description: "",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      publishLegalRule(f.actor, {
        ...(await scope(result.legalRuleId, result.versionId)),
        checksum,
        reviewed: "yes",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createLegalRule(f.actor, f.command)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const current = await scope(result.legalRuleId, result.versionId);
    const outcomes = await Promise.allSettled([
      startLegalDraft(f.actor, current),
      startLegalDraft(f.actor, current),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    expect(await testPrisma.legalRuleVersion.count()).toBe(2);
  });
  it("supersedes published content without rewriting existing request snapshots, and preserves operator work on reseed", async () => {
    const workflow = await workflowFixture();
    const {
      requestIds: [requestId],
    } = await generateRequests(workflow.actor, workflow.input);
    const request = await getOwnedRequest(workflow.actor, requestId!);
    const original = await testPrisma.legalRuleVersion.findUniqueOrThrow({
      where: { id: request.legalRuleVersionId! },
    });
    const f = await fixture();
    const next = await startLegalDraft(
      f.actor,
      await scope(original.legalRuleId, original.id)
    );
    const source = {
      ...legalSourceFromVersion(original),
      legalBasisText: f.command.legalBasisText,
      changeNotes: "Synthetic correction reviewed against scope and timing.",
    };
    await saveLegalDraft(f.actor, {
      ...source,
      ...(await scope(next.legalRuleId, next.versionId)),
    });
    await publish(f.actor, next);
    await seedLegalRules(testPrisma);
    invalidateCatalogCache();
    expect(
      (await listPublishedLegalRules()).find(
        (row) => row.legalRuleId === original.legalRuleId
      )?.legalRuleVersionId
    ).toBe(next.versionId);
    const retained = await getOwnedRequest(workflow.actor, request.id);
    expect(retained.snapshots[0]!.body).toBe(request.snapshots[0]!.body);
    expect(retained.legalRuleVersionId).toBe(original.id);
    expect(
      (
        await testPrisma.legalRuleVersion.findUniqueOrThrow({
          where: { id: original.id },
        })
      ).status
    ).toBe("SUPERSEDED");
    await expect(
      saveLegalDraft(f.actor, {
        ...source,
        ...(await scope(original.legalRuleId, original.id)),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      testPrisma.legalRuleVersion.update({
        where: { id: original.id },
        data: { legalBasisText: "Changed history" },
      })
    ).rejects.toThrow();
  });
  it("keeps current law active before a future effective date and does not revive it after the replacement expires", async () => {
    const f = await fixture();
    const current = await createLegalRule(f.actor, f.command);
    await publish(f.actor, current);
    const next = await startLegalDraft(
      f.actor,
      await scope(current.legalRuleId, current.versionId)
    );
    const nextYear = new Date().getUTCFullYear() + 1;
    const from = nextYear + "-01-01T00:00:00.000Z";
    const until = nextYear + "-01-03T00:00:00.000Z";
    await saveLegalDraft(f.actor, {
      ...f.command,
      ...(await scope(next.legalRuleId, next.versionId)),
      effectiveFrom: from,
      effectiveUntil: until,
    });
    await publish(f.actor, next);
    expect((await listPublishedLegalRules())[0]!.legalRuleVersionId).toBe(
      current.versionId
    );
    expect(
      (
        await testPrisma.legalRuleVersion.findUniqueOrThrow({
          where: { id: current.versionId },
        })
      ).status
    ).toBe("PUBLISHED");
    expect(
      (await listLegalRuleAdministration(f.actor, { status: "scheduled" })).total
    ).toBe(1);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(nextYear + "-01-02T00:00:00.000Z"));
      invalidateCatalogCache();
      expect((await listPublishedLegalRules())[0]!.legalRuleVersionId).toBe(
        next.versionId
      );
      vi.setSystemTime(new Date(nextYear + "-01-04T00:00:00.000Z"));
      invalidateCatalogCache();
      expect(await listPublishedLegalRules()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
      invalidateCatalogCache();
    }
    await deactivateLegalRule(f.actor, await scope(current.legalRuleId));
    expect(await listPublishedLegalRules()).toHaveLength(0);
  });
  it("rolls back parent creation and publication when a version write fails", async () => {
    const f = await fixture();
    const first = await createLegalRule(f.actor, f.command);
    await publish(f.actor, first);
    const next = await startLegalDraft(
      f.actor,
      await scope(first.legalRuleId, first.versionId)
    );
    await saveLegalDraft(f.actor, {
      ...f.command,
      ...(await scope(next.legalRuleId, next.versionId)),
    });
    await testPrisma.$executeRawUnsafe(
      "CREATE FUNCTION test_reject_legal_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected legal version failure'; END $$"
    );
    await testPrisma.$executeRawUnsafe(
      'CREATE TRIGGER test_reject_legal_version BEFORE INSERT OR UPDATE ON "LegalRuleVersion" FOR EACH ROW EXECUTE FUNCTION test_reject_legal_version()'
    );
    try {
      await expect(
        createLegalRule(f.actor, { ...f.command, key: "operator.failed" })
      ).rejects.toThrow();
      await expect(publish(f.actor, next)).rejects.toThrow();
      expect(await testPrisma.legalRule.count()).toBe(1);
      expect((await listPublishedLegalRules())[0]!.legalRuleVersionId).toBe(
        first.versionId
      );
      expect(
        (
          await testPrisma.legalRuleVersion.findUniqueOrThrow({
            where: { id: next.versionId },
          })
        ).status
      ).toBe("DRAFT");
    } finally {
      await testPrisma.$executeRawUnsafe(
        'DROP TRIGGER test_reject_legal_version ON "LegalRuleVersion"'
      );
      await testPrisma.$executeRawUnsafe("DROP FUNCTION test_reject_legal_version()");
    }
  });
  it("paginates configuration metadata, preserves filters and rejects invalid bounds", async () => {
    const f = await fixture();
    for (let index = 0; index < 5; index++)
      await createLegalRule(f.actor, { ...f.command, key: "operator.page-" + index });
    const filters = {
      limit: 2,
      search: "synthetic",
      status: "draft",
      jurisdictionId: f.command.jurisdictionId,
    };
    const first = await listLegalRuleAdministration(f.actor, filters);
    const second = await listLegalRuleAdministration(f.actor, {
      ...filters,
      cursor: first.nextCursor,
    });
    expect(first.total).toBe(5);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(
      second.items.some((row) => first.items.some((prior) => prior.id === row.id))
    ).toBe(false);
    expect(first.items[0]!.versions[0]).not.toHaveProperty("legalBasisText");
    const history = await getLegalRuleAdministration(f.actor, {
      legalRuleId: first.items[0]!.id,
    });
    expect(history.versions.items[0]).not.toHaveProperty("verificationRequirements");
    await expect(
      listLegalRuleAdministration(f.actor, { limit: 101 })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      listLegalRuleAdministration(f.actor, { cursor: "invalid" })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
  it("allows repair of a legacy version without guessing a statutory day count", async () => {
    const f = await fixture();
    const prepared = prepareLegalSource(f.command);
    const legacy = await testPrisma.legalRule.create({
      data: {
        jurisdictionId: f.command.jurisdictionId,
        key: "operator.legacy",
        lawName: "Legacy",
        shortName: "Legacy",
        versions: {
          create: {
            ...prepared.content,
            deadlineRule: { baseDays: 30, verified: true },
            version: 1,
            status: "PUBLISHED",
          },
        },
      },
      include: { versions: true },
    });
    const next = await startLegalDraft(
      f.actor,
      await scope(legacy.id, legacy.versions[0]!.id)
    );
    await expect(publish(f.actor, next)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await saveLegalDraft(f.actor, {
      ...f.command,
      ...(await scope(next.legalRuleId, next.versionId)),
    });
    await publish(f.actor, next);
    expect(
      (
        await testPrisma.legalRuleVersion.findUniqueOrThrow({
          where: { id: legacy.versions[0]!.id },
        })
      ).deadlineRule
    ).toEqual({ baseDays: 30, verified: true });
    expect((await listPublishedLegalRules())[0]!.legalRuleVersionId).toBe(next.versionId);
  });
});

it("queues the oldest draft/published version needing source review without publishing it", async () => {
  const { actor } = await fixture();
  await seedLegalRules(testPrisma);
  const selected = await testPrisma.legalRuleVersion.findFirstOrThrow({
    where: { status: "PUBLISHED" },
  });
  const before = await testPrisma.legalRuleVersion.findMany({
    where: { legalRuleId: selected.legalRuleId },
  });
  const queue = await listLegalRuleAdministration(actor, {
    status: "review",
    search: (
      await testPrisma.legalRule.findUniqueOrThrow({
        where: { id: selected.legalRuleId },
      })
    ).key,
  });
  expect(queue.items.map((row) => row.id)).toContain(selected.legalRuleId);
  expect(
    queue.items.find((row) => row.id === selected.legalRuleId)?.versions[0]
      ?.requiresLegalReview
  ).toBe(true);
  expect(
    await testPrisma.legalRuleVersion.findMany({
      where: { legalRuleId: selected.legalRuleId },
    })
  ).toEqual(before);
  await expect(
    listLegalRuleAdministration({ ...actor, role: "USER" }, { status: "review" })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
