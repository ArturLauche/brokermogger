import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createTemplate,
  startDraft,
  saveDraft,
  publishTemplate,
  deactivate,
} from "@/lib/admin/templates";
import {
  createTemplateRecord,
  getTemplateAdministration,
  getTemplateVersionAdministration,
  listTemplateAdministration,
  updateTemplateMetadata,
} from "@/lib/db/repositories/adminTemplates";
import { findPublishedTemplate } from "@/lib/db/repositories/catalog";
import { DEFAULT_TEMPLATE_SOURCE } from "@/lib/templates/authoring";
import { seedJurisdictions } from "@/prisma/seeds/jurisdictions";
import { seedRequestTemplates } from "@/prisma/seeds/templates";
import { testActor } from "../../helpers/actor";
import { testPrisma } from "../../helpers/db";

async function operator() {
  const user = await testPrisma.user.create({
    data: { role: "MAINTAINER", email: `template-operator-${randomUUID()}@example.org` },
  });
  return testActor(user.id, "MAINTAINER");
}
const command = {
  ...DEFAULT_TEMPLATE_SOURCE,
  key: "operator.deletion",
  name: "Operator deletion",
  description: "Synthetic integration template",
  requestType: "DELETION",
  channel: "EMAIL",
  jurisdictionId: "",
  changeNotes: "Synthetic review of scope and rendered values.",
};
async function scope(templateId: string, versionId?: string) {
  const row = await testPrisma.requestTemplate.findUniqueOrThrow({
    where: { id: templateId },
  });
  return {
    templateId,
    ...(versionId ? { versionId } : {}),
    expectedUpdatedAt: row.updatedAt.toISOString(),
  };
}
async function publish(
  actor: Awaited<ReturnType<typeof operator>>,
  result: { templateId: string; versionId: string }
) {
  const version = await testPrisma.requestTemplateVersion.findUniqueOrThrow({
    where: { id: result.versionId },
  });
  return publishTemplate(actor, {
    ...(await scope(result.templateId, result.versionId)),
    checksum: version.checksum,
    reviewed: "yes",
  });
}
describe("operator template authoring", () => {
  it("enforces permissions, active operators and the template/version relationship", async () => {
    const actor = await operator();
    await expect(
      createTemplateRecord({ ...actor, role: "USER" }, command)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      listTemplateAdministration({ ...actor, role: "USER" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const first = await createTemplate(actor, command);
    const other = await createTemplate(actor, { ...command, key: "operator.other" });
    await expect(
      getTemplateVersionAdministration(actor, {
        templateId: first.templateId,
        versionId: other.versionId,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      saveDraft(actor, {
        ...command,
        ...(await scope(first.templateId, other.versionId)),
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await testPrisma.user.update({
      where: { id: actor.userId },
      data: { status: "PENDING_DELETION" },
    });
    await expect(
      createTemplateRecord(actor, { ...command, key: "operator.blocked" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("keeps incomplete drafts inactive and requires complete text, review notes and confirmation", async () => {
    const actor = await operator();
    const result = await createTemplate(actor, {
      ...command,
      bodyTemplate: "Hello {{profile.fullName}}",
      changeNotes: "",
    });
    expect(
      await findPublishedTemplate({ requestType: "DELETION", jurisdictionId: null })
    ).toBeNull();
    await expect(publish(actor, result)).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const version = await testPrisma.requestTemplateVersion.findUniqueOrThrow({
      where: { id: result.versionId },
    });
    await expect(
      publishTemplate(actor, {
        ...(await scope(result.templateId, result.versionId)),
        checksum: version.checksum,
        reviewed: "",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(version.status).toBe("DRAFT");
    expect(
      (
        await testPrisma.requestTemplate.findUniqueOrThrow({
          where: { id: result.templateId },
        })
      ).isActive
    ).toBe(false);
    await saveDraft(actor, {
      ...command,
      ...(await scope(result.templateId, result.versionId)),
    });
    await publish(actor, result);
    expect(
      (await findPublishedTemplate({ requestType: "DELETION", jurisdictionId: null }))
        ?.version.id
    ).toBe(result.versionId);
  });
  it("rejects stale edits, changed previews, duplicate keys and competing draft creation", async () => {
    const actor = await operator();
    const result = await createTemplate(actor, command);
    const stale = await scope(result.templateId, result.versionId);
    const oldVersion = await testPrisma.requestTemplateVersion.findUniqueOrThrow({
      where: { id: result.versionId },
    });
    await saveDraft(actor, {
      ...command,
      ...stale,
      bodyTemplate: command.bodyTemplate + "\nEdited text.",
    });
    await expect(
      updateTemplateMetadata(actor, { ...stale, name: "Stale", description: "" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      publishTemplate(actor, {
        ...(await scope(result.templateId, result.versionId)),
        checksum: oldVersion.checksum,
        reviewed: "yes",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createTemplate(actor, command)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const current = await scope(result.templateId, result.versionId);
    const competing = await Promise.allSettled([
      startDraft(actor, current),
      startDraft(actor, current),
    ]);
    expect(competing.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(competing.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "CONFLICT" },
    });
    expect(
      (
        await testPrisma.requestTemplateVersion.findMany({
          where: { templateId: result.templateId },
          orderBy: { version: "asc" },
        })
      ).map((v) => v.version)
    ).toEqual([1, 2]);
  });
  it("serializes replacement publication across operators and preserves old content", async () => {
    const firstActor = await operator();
    const secondActor = await operator();
    const first = await createTemplate(firstActor, command);
    const second = await createTemplate(secondActor, {
      ...command,
      key: "operator.replacement",
      bodyTemplate: command.bodyTemplate + "\nSecond letter.",
    });
    const results = await Promise.allSettled([
      publish(firstActor, first),
      publish(secondActor, second),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await testPrisma.requestTemplate.count({ where: { isActive: true } })).toBe(1);
    expect(
      await testPrisma.requestTemplateVersion.count({ where: { status: "PUBLISHED" } })
    ).toBe(2);
    expect(
      await testPrisma.auditLog.count({
        where: { action: "admin.template_version_published" },
      })
    ).toBe(2);
    const chosen = await findPublishedTemplate({
      requestType: "DELETION",
      jurisdictionId: null,
    });
    expect(chosen).not.toBeNull();
    await expect(
      saveDraft(firstActor, {
        ...command,
        ...(await scope(chosen!.template.id, chosen!.version.id)),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const next = await startDraft(
      firstActor,
      await scope(chosen!.template.id, chosen!.version.id)
    );
    await saveDraft(firstActor, {
      ...command,
      bodyTemplate: command.bodyTemplate + "\nNew version.",
      ...(await scope(next.templateId, next.versionId)),
    });
    await publish(firstActor, next);
    expect(
      (
        await testPrisma.requestTemplateVersion.findUniqueOrThrow({
          where: { id: chosen!.version.id },
        })
      ).status
    ).toBe("SUPERSEDED");
    expect(
      (await findPublishedTemplate({ requestType: "DELETION", jurisdictionId: null }))
        ?.version.id
    ).toBe(next.versionId);
    await deactivate(firstActor, await scope(next.templateId));
    expect(
      await findPublishedTemplate({ requestType: "DELETION", jurisdictionId: null })
    ).toBeNull();
  });
  it("rolls back parent creation and scope replacement if version writes fail", async () => {
    const actor = await operator();
    const first = await createTemplate(actor, command);
    await publish(actor, first);
    const next = await createTemplate(actor, { ...command, key: "operator.next" });
    await testPrisma.$executeRawUnsafe(
      `CREATE FUNCTION test_reject_template() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected template failure'; END $$`
    );
    await testPrisma.$executeRawUnsafe(
      `CREATE TRIGGER test_reject_template BEFORE INSERT OR UPDATE ON "RequestTemplateVersion" FOR EACH ROW EXECUTE FUNCTION test_reject_template()`
    );
    try {
      await expect(
        createTemplate(actor, { ...command, key: "operator.fail" })
      ).rejects.toThrow();
      await expect(publish(actor, next)).rejects.toThrow();
      expect(await testPrisma.requestTemplate.count()).toBe(2);
      expect(
        (await findPublishedTemplate({ requestType: "DELETION", jurisdictionId: null }))
          ?.version.id
      ).toBe(first.versionId);
      expect(
        (
          await testPrisma.requestTemplateVersion.findUniqueOrThrow({
            where: { id: next.versionId },
          })
        ).status
      ).toBe("DRAFT");
    } finally {
      await testPrisma.$executeRawUnsafe(
        `DROP TRIGGER test_reject_template ON "RequestTemplateVersion"`
      );
      await testPrisma.$executeRawUnsafe(`DROP FUNCTION test_reject_template()`);
    }
  });
  it("selects by jurisdiction and channel, with a deterministic plain-letter fallback", async () => {
    const actor = await operator();
    await seedJurisdictions(testPrisma);
    const jurisdiction = await testPrisma.jurisdiction.findUniqueOrThrow({
      where: { code: "DE" },
    });
    const generic = await createTemplate(actor, command);
    await publish(actor, generic);
    const specific = await createTemplate(actor, {
      ...command,
      key: "operator.germany",
      jurisdictionId: jurisdiction.id,
    });
    await publish(actor, specific);
    const portal = await createTemplate(actor, {
      ...command,
      key: "operator.portal",
      jurisdictionId: jurisdiction.id,
      channel: "WEB_FORM",
    });
    await publish(actor, portal);
    expect(
      (
        await findPublishedTemplate({
          requestType: "DELETION",
          jurisdictionId: jurisdiction.id,
          channel: "WEB_FORM",
        })
      )?.version.id
    ).toBe(portal.versionId);
    expect(
      (
        await findPublishedTemplate({
          requestType: "DELETION",
          jurisdictionId: jurisdiction.id,
          channel: "POSTAL",
        })
      )?.version.id
    ).toBe(specific.versionId);
    expect(
      (
        await findPublishedTemplate({
          requestType: "DELETION",
          jurisdictionId: null,
          channel: "WEB_FORM",
        })
      )?.version.id
    ).toBe(generic.versionId);
    await deactivate(actor, await scope(specific.templateId));
    expect(
      (
        await findPublishedTemplate({
          requestType: "DELETION",
          jurisdictionId: jurisdiction.id,
          channel: "EMAIL",
        })
      )?.version.id
    ).toBe(generic.versionId);
    await deactivate(actor, await scope(generic.templateId));
    expect(
      await findPublishedTemplate({
        requestType: "DELETION",
        jurisdictionId: jurisdiction.id,
        channel: "EMAIL",
      })
    ).toBeNull();
  });
  it("preserves operator versions on reseed and permits repair of a malformed legacy source", async () => {
    const actor = await operator();
    await seedJurisdictions(testPrisma);
    await seedRequestTemplates(testPrisma);
    const parent = await testPrisma.requestTemplate.findUniqueOrThrow({
      where: { key: "generic.deletion" },
      include: { versions: true },
    });
    const draft = await startDraft(actor, await scope(parent.id, parent.versions[0]!.id));
    await saveDraft(actor, {
      ...command,
      bodyTemplate: command.bodyTemplate + "\nOperator review.",
      ...(await scope(parent.id, draft.versionId)),
    });
    await publish(actor, draft);
    await seedRequestTemplates(testPrisma);
    expect(
      (await findPublishedTemplate({ requestType: "DELETION", jurisdictionId: null }))
        ?.version.id
    ).toBe(draft.versionId);
    const legacy = await testPrisma.requestTemplate.create({
      data: {
        key: "operator.legacy",
        name: "Legacy",
        requestType: "ACCESS",
        versions: {
          create: {
            version: 1,
            status: "PUBLISHED",
            subjectTemplate: "Request",
            bodyTemplate: "{{broken",
            checksum: "legacy",
            changeNotes: "Legacy source",
          },
        },
      },
      include: { versions: true },
    });
    const repair = await startDraft(
      actor,
      await scope(legacy.id, legacy.versions[0]!.id)
    );
    await saveDraft(actor, { ...command, ...(await scope(legacy.id, repair.versionId)) });
    await publish(actor, repair);
    expect(
      (
        await testPrisma.requestTemplateVersion.findUniqueOrThrow({
          where: { id: legacy.versions[0]!.id },
        })
      ).bodyTemplate
    ).toBe("{{broken");
  });
  it("does not activate a new seeded competitor over an operator's published choice", async () => {
    const actor = await operator();
    const custom = await createTemplate(actor, command);
    await publish(actor, custom);
    await seedJurisdictions(testPrisma);
    await seedRequestTemplates(testPrisma);
    const seeded = await testPrisma.requestTemplate.findUniqueOrThrow({
      where: { key: "generic.deletion" },
      include: { versions: true },
    });
    expect(seeded.isActive).toBe(false);
    expect(seeded.versions[0]!.status).toBe("DRAFT");
    expect(
      (await findPublishedTemplate({ requestType: "DELETION", jurisdictionId: null }))
        ?.version.id
    ).toBe(custom.versionId);
  });

  it("paginates metadata without returning letter content and validates filters", async () => {
    const actor = await operator();
    for (let i = 0; i < 5; i++)
      await createTemplate(actor, { ...command, key: `operator.page-${i}` });
    const first = await listTemplateAdministration(actor, {
      limit: 2,
      status: "draft",
      search: "operator",
    });
    const second = await listTemplateAdministration(actor, {
      limit: 2,
      status: "draft",
      search: "operator",
      cursor: first.nextCursor,
    });
    expect(first.total).toBe(5);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(
      second.items.some((row) => first.items.some((prior) => prior.id === row.id))
    ).toBe(false);
    expect(first.items[0]!.versions[0]).not.toHaveProperty("bodyTemplate");
    const history = await getTemplateAdministration(actor, {
      templateId: first.items[0]!.id,
    });
    expect(history.versions.items[0]).not.toHaveProperty("subjectTemplate");
    await expect(listTemplateAdministration(actor, { limit: 101 })).rejects.toMatchObject(
      { code: "VALIDATION_FAILED" }
    );
  });
});
