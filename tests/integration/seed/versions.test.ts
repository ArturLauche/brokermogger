import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { seedJurisdictions } from "@/prisma/seeds/jurisdictions";
import { seedLegalRules } from "@/prisma/seeds/legalRules";
import { seedRequestTemplates } from "@/prisma/seeds/templates";
import { LEGAL_RULES } from "@/prisma/seeds/data/legal-rules";
import { REQUEST_TEMPLATES } from "@/prisma/seeds/data/templates";
import {
  invalidateCatalogCache,
  listPublishedLegalRules,
} from "@/lib/db/repositories/catalog";
import { testPrisma } from "../../helpers/db";

describe("immutable catalogue versions", () => {
  it("retires premature India and generic US defaults without rewriting history or reactivating them", async () => {
    await seedJurisdictions(testPrisma);
    await seedLegalRules(testPrisma);
    const indian = await testPrisma.legalRule.findFirstOrThrow({
      where: { key: "dpdp-data-principal-rights" },
      include: { versions: true },
    });
    const source = indian.versions[0]!;
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...content } = source;
    const legacy = await testPrisma.legalRuleVersion.create({
      data: {
        ...content,
        deadlineRule: content.deadlineRule ?? Prisma.JsonNull,
        verificationRequirements: content.verificationRequirements ?? Prisma.JsonNull,
        templateClauses: content.templateClauses ?? Prisma.JsonNull,
        additionalSources: content.additionalSources ?? Prisma.JsonNull,
        version: 2,
        effectiveFrom: new Date("2023-08-11T00:00:00Z"),
        legalBasisText: "Synthetic prematurely published DPDP rights",
      },
    });
    const jurisdiction = await testPrisma.jurisdiction.findUniqueOrThrow({
      where: { code: "US-OTHER" },
    });
    const { legalRuleId: _legacyParent, ...nestedContent } = content;
    const generic = await testPrisma.legalRule.create({
      data: {
        jurisdictionId: jurisdiction.id,
        key: "us-state-privacy-rights",
        lawName: "Legacy generic state rule",
        shortName: "Legacy",
        description: "Synthetic legacy unspecific statutory rule",
        versions: {
          create: {
            ...nestedContent,
            deadlineRule: content.deadlineRule ?? Prisma.JsonNull,
            verificationRequirements: content.verificationRequirements ?? Prisma.JsonNull,
            templateClauses: content.templateClauses ?? Prisma.JsonNull,
            additionalSources: content.additionalSources ?? Prisma.JsonNull,
            version: 1,
            effectiveFrom: new Date("2023-01-01T00:00:00Z"),
          },
        },
      },
    });
    await seedLegalRules(testPrisma);
    const archived = await testPrisma.legalRuleVersion.findUniqueOrThrow({
      where: { id: legacy.id },
    });
    expect(archived.status).toBe("ARCHIVED");
    expect(archived.legalBasisText).toBe(legacy.legalBasisText);
    expect(
      (await testPrisma.legalRule.findUniqueOrThrow({ where: { id: generic.id } }))
        .isActive
    ).toBe(false);
    expect(
      (
        await testPrisma.legalRuleVersion.findFirstOrThrow({
          where: { legalRuleId: generic.id },
        })
      ).status
    ).toBe("ARCHIVED");
    invalidateCatalogCache();
    const available = await listPublishedLegalRules();
    expect(
      available.some(
        (row) => row.legalRuleId === indian.id || row.legalRuleId === generic.id
      )
    ).toBe(false);
    const before = await testPrisma.legalRuleVersion.count();
    await seedLegalRules(testPrisma);
    expect(await testPrisma.legalRuleVersion.count()).toBe(before);
    expect(
      (await testPrisma.legalRuleVersion.findUniqueOrThrow({ where: { id: legacy.id } }))
        .status
    ).toBe("ARCHIVED");
  });

  it("preserves operator authority when retiring a default catalogue entry", async () => {
    await seedJurisdictions(testPrisma);
    await seedLegalRules(testPrisma);
    const source = await testPrisma.legalRuleVersion.findFirstOrThrow();
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...content } = source;
    const jurisdiction = await testPrisma.jurisdiction.findUniqueOrThrow({
      where: { code: "US-OTHER" },
    });
    const { legalRuleId: _legacyParent, ...nestedContent } = content;
    const rule = await testPrisma.legalRule.create({
      data: {
        jurisdictionId: jurisdiction.id,
        key: "us-state-privacy-rights",
        lawName: "Operator-reviewed case",
        shortName: "Operator",
        description: "Operator-defined scope requiring separate review",
        updatedById: "test-operator",
        versions: {
          create: {
            ...nestedContent,
            deadlineRule: content.deadlineRule ?? Prisma.JsonNull,
            verificationRequirements: content.verificationRequirements ?? Prisma.JsonNull,
            templateClauses: content.templateClauses ?? Prisma.JsonNull,
            additionalSources: content.additionalSources ?? Prisma.JsonNull,
            version: 1,
          },
        },
      },
    });
    await seedLegalRules(testPrisma);
    expect(
      (await testPrisma.legalRule.findUniqueOrThrow({ where: { id: rule.id } })).isActive
    ).toBe(true);
    expect(
      (
        await testPrisma.legalRuleVersion.findFirstOrThrow({
          where: { legalRuleId: rule.id },
        })
      ).status
    ).toBe("PUBLISHED");
  });

  it("does not re-enable an operator-disabled jurisdiction during a seed update", async () => {
    await seedJurisdictions(testPrisma);
    await testPrisma.jurisdiction.update({
      where: { code: "US-TX" },
      data: { isActive: false },
    });
    await seedJurisdictions(testPrisma);
    expect(
      (await testPrisma.jurisdiction.findUniqueOrThrow({ where: { code: "US-TX" } }))
        .isActive
    ).toBe(false);
  });

  it("changes timed packs exactly at their effective instant even with a warm cache", async () => {
    await seedJurisdictions(testPrisma);
    await seedLegalRules(testPrisma);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-01T03:59:59.999Z"));
      invalidateCatalogCache();
      const before = await listPublishedLegalRules();
      const current = before.find(
        (row) => row.legalRuleKey === "ct-consumer-privacy-rights"
      )!;
      vi.setSystemTime(new Date("2026-10-01T04:00:00.000Z"));
      const after = await listPublishedLegalRules();
      expect(
        after.find((row) => row.legalRuleKey === current.legalRuleKey)?.legalRuleVersionId
      ).not.toBe(current.legalRuleVersionId);
      vi.setSystemTime(new Date("2027-05-12T18:29:59.999Z"));
      invalidateCatalogCache();
      const indianBefore = await listPublishedLegalRules();
      expect(
        indianBefore.some((row) => row.legalRuleKey === "india-voluntary-privacy-request")
      ).toBe(true);
      expect(
        indianBefore.some((row) => row.legalRuleKey === "dpdp-data-principal-rights")
      ).toBe(false);
      vi.setSystemTime(new Date("2027-05-12T18:30:00.000Z"));
      const indianAfter = await listPublishedLegalRules();
      expect(
        indianAfter.some((row) => row.legalRuleKey === "dpdp-data-principal-rights")
      ).toBe(true);
      expect(
        indianAfter.some((row) => row.legalRuleKey === "india-voluntary-privacy-request")
      ).toBe(false);
    } finally {
      vi.useRealTimers();
      invalidateCatalogCache();
    }
  });
  it("serializes concurrent first installs and updates without duplicate versions", async () => {
    await seedJurisdictions(testPrisma);
    expect(
      await Promise.allSettled([seedLegalRules(testPrisma), seedLegalRules(testPrisma)])
    ).toEqual([
      expect.objectContaining({ status: "fulfilled" }),
      expect.objectContaining({ status: "fulfilled" }),
    ]);
    expect(
      await Promise.allSettled([
        seedRequestTemplates(testPrisma),
        seedRequestTemplates(testPrisma),
      ])
    ).toEqual([
      expect.objectContaining({ status: "fulfilled" }),
      expect.objectContaining({ status: "fulfilled" }),
    ]);
    const source = REQUEST_TEMPLATES[0]!;
    const original = source.version.bodyTemplate;
    try {
      source.version.bodyTemplate += "\nConcurrent synthetic update.";
      const results = await Promise.allSettled([
        seedRequestTemplates(testPrisma),
        seedRequestTemplates(testPrisma),
      ]);
      expect(results.every((result) => result.status === "fulfilled")).toBe(true);
      const stored = await testPrisma.requestTemplate.findUniqueOrThrow({
        where: { key: source.key },
        include: { versions: { orderBy: { version: "asc" } } },
      });
      expect(stored.versions.map((version) => version.version)).toEqual([1, 2]);
      expect(
        stored.versions.filter((version) => version.status === "PUBLISHED")
      ).toHaveLength(1);
    } finally {
      source.version.bodyTemplate = original;
    }
  });
  it("creates a new template version on seed changes and never rewrites or revives history", async () => {
    await seedJurisdictions(testPrisma);
    await seedRequestTemplates(testPrisma);
    const source = REQUEST_TEMPLATES[0]!;
    const originalBody = source.version.bodyTemplate;
    const before = await testPrisma.requestTemplate.findUniqueOrThrow({
      where: { key: source.key },
      include: { versions: true },
    });
    try {
      source.version.bodyTemplate += "\nSynthetic change for version preservation.";
      await seedRequestTemplates(testPrisma);
      const versions = await testPrisma.requestTemplateVersion.findMany({
        where: { templateId: before.id },
        orderBy: { version: "asc" },
      });
      expect(versions).toHaveLength(2);
      expect(versions[0]!.bodyTemplate).toBe(originalBody);
      expect(versions[0]!.status).toBe("SUPERSEDED");
      expect(versions[1]!.version).toBe(2);
      expect(versions[1]!.status).toBe("PUBLISHED");
      await seedRequestTemplates(testPrisma);
      expect(
        await testPrisma.requestTemplateVersion.count({
          where: { templateId: before.id },
        })
      ).toBe(2);
    } finally {
      source.version.bodyTemplate = originalBody;
    }
    // A deployment rollback does not silently republish the old template.
    await seedRequestTemplates(testPrisma);
    expect(
      (
        await testPrisma.requestTemplateVersion.findUniqueOrThrow({
          where: { id: before.versions[0]!.id },
        })
      ).status
    ).toBe("SUPERSEDED");
  });

  it("creates a new legal version and preserves both reviewed content and operator choices", async () => {
    await seedJurisdictions(testPrisma);
    await seedLegalRules(testPrisma);
    const source = LEGAL_RULES[0]!;
    const original = source.versions[0]!.riskNotes;
    const before = await testPrisma.legalRule.findFirstOrThrow({
      where: { key: source.key },
      include: { versions: true },
    });
    await testPrisma.legalRule.update({
      where: { id: before.id },
      data: {
        isActive: false,
        updatedById: "test-operator",
        description: "Operator-maintained description",
      },
    });
    try {
      source.versions[0]!.riskNotes += " Synthetic reviewed change.";
      await seedLegalRules(testPrisma);
      const current = await testPrisma.legalRule.findUniqueOrThrow({
        where: { id: before.id },
        include: { versions: { orderBy: { version: "asc" } } },
      });
      expect(current.isActive).toBe(false);
      expect(current.description).toBe("Operator-maintained description");
      expect(current.versions).toHaveLength(2);
      expect(current.versions[0]!.riskNotes).toBe(original);
      expect(current.versions[1]!.status).toBe("DRAFT");
    } finally {
      source.versions[0]!.riskNotes = original;
    }
  });

  it("rejects edits, deletion and draft downgrades of published content at the database", async () => {
    await seedJurisdictions(testPrisma);
    await seedLegalRules(testPrisma);
    await seedRequestTemplates(testPrisma);
    const rule = await testPrisma.legalRuleVersion.findFirstOrThrow();
    const template = await testPrisma.requestTemplateVersion.findFirstOrThrow({
      include: { template: true },
    });
    await expect(
      testPrisma.legalRuleVersion.update({
        where: { id: rule.id },
        data: { legalBasisText: "changed" },
      })
    ).rejects.toThrow();
    await expect(
      testPrisma.requestTemplateVersion.update({
        where: { id: template.id },
        data: { bodyTemplate: "changed" },
      })
    ).rejects.toThrow();
    await expect(
      testPrisma.requestTemplateVersion.update({
        where: { id: template.id },
        data: { status: "DRAFT" },
      })
    ).rejects.toThrow();
    await expect(
      testPrisma.legalRuleVersion.delete({ where: { id: rule.id } })
    ).rejects.toThrow();
    await expect(
      testPrisma.legalRule.update({
        where: { id: rule.legalRuleId },
        data: { key: "changed-scope" },
      })
    ).rejects.toThrow();
    await expect(
      testPrisma.requestTemplate.update({
        where: { id: template.templateId },
        data: { channel: template.template.channel === "EMAIL" ? "POSTAL" : "EMAIL" },
      })
    ).rejects.toThrow();
    await testPrisma.requestTemplateVersion.update({
      where: { id: template.id },
      data: { status: "SUPERSEDED" },
    });
    await expect(
      testPrisma.requestTemplateVersion.update({
        where: { id: template.id },
        data: { status: "PUBLISHED" },
      })
    ).rejects.toThrow();
  });

  it("does not apply future or inactive legal rules", async () => {
    await seedJurisdictions(testPrisma);
    await seedLegalRules(testPrisma);
    const version = await testPrisma.legalRuleVersion.findFirstOrThrow();
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...copy } = version;
    await testPrisma.legalRuleVersion.create({
      data: {
        ...copy,
        deadlineRule: copy.deadlineRule ?? Prisma.JsonNull,
        verificationRequirements: copy.verificationRequirements ?? Prisma.JsonNull,
        templateClauses: copy.templateClauses ?? Prisma.JsonNull,
        additionalSources: copy.additionalSources ?? Prisma.JsonNull,
        version: 2,
        effectiveFrom: new Date("2099-01-01"),
        legalBasisText: "Future synthetic rule",
      },
    });
    invalidateCatalogCache();
    expect(
      (await listPublishedLegalRules()).find((x) => x.legalRuleId === version.legalRuleId)
        ?.legalRuleVersionId
    ).toBe(version.id);
    await testPrisma.legalRule.update({
      where: { id: version.legalRuleId },
      data: { isActive: false },
    });
    invalidateCatalogCache();
    expect(
      (await listPublishedLegalRules()).some((x) => x.legalRuleId === version.legalRuleId)
    ).toBe(false);
  });
});
