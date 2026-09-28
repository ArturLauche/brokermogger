import { describe, expect, it } from "vitest";
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
