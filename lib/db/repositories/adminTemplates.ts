import type { Prisma, RequestTemplate } from "@prisma/client";
import { z } from "zod";
import {
  createTemplateSchema,
  templateMetadataSchema,
  templateScopeSchema,
  templateVersionScopeSchema,
  saveTemplateDraftSchema,
  publishTemplateSchema,
} from "@/lib/admin/templateCommands";
import { AppError, NotFoundError } from "@/lib/core/errors";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { pageInputSchema, createdBeforeCursor, cursorPage } from "@/lib/pagination";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import {
  prepareTemplateSource,
  validateTemplatePublication,
} from "@/lib/templates/authoring";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { lockAuthorizedAccount } from "./access";
import { sha256Hex } from "@/lib/security/crypto";
import {
  assertCatalogueRevision,
  nextCatalogueRevision,
  translateCatalogueConflict,
} from "./catalogueEditing";

const listSchema = pageInputSchema.extend({
  search: z.string().trim().max(100).default(""),
  status: z.enum(["all", "draft", "published", "inactive"]).default("all"),
});
export async function listTemplateAdministration(actor: ActorContext, raw: unknown = {}) {
  requirePermission(actor, "admin:template:read");
  const input = parseWithSchema(listSchema, raw);
  const where: Prisma.RequestTemplateWhereInput = {
    deletedAt: null,
    ...(input.search
      ? {
          OR: ["name", "key"].map((field) => ({
            [field]: { contains: input.search, mode: "insensitive" },
          })),
        }
      : {}),
    ...(input.status === "inactive" ? { isActive: false } : {}),
    ...(input.status === "published"
      ? { isActive: true, versions: { some: { status: "PUBLISHED" } } }
      : {}),
    ...(input.status === "draft" ? { versions: { some: { status: "DRAFT" } } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.requestTemplate.findMany({
      where: { AND: [where, createdBeforeCursor(input.cursor)] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      select: {
        id: true,
        name: true,
        key: true,
        createdAt: true,
        requestType: true,
        channel: true,
        isActive: true,
        jurisdiction: { select: { name: true, code: true } },
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: { version: true, status: true },
        },
      },
    }),
    prisma.requestTemplate.count({ where }),
  ]);
  return { ...cursorPage(rows, input.limit), total };
}

export async function getTemplateAdministration(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:template:read");
  const input = parseWithSchema(
    pageInputSchema.extend({ templateId: entityIdSchema }),
    raw
  );
  const template = await prisma.requestTemplate.findFirst({
    where: { id: input.templateId, deletedAt: null },
    include: { jurisdiction: { select: { name: true, code: true } } },
  });
  if (!template) throw new NotFoundError("This template does not exist.");
  const rows = await prisma.requestTemplateVersion.findMany({
    where: { templateId: template.id, ...createdBeforeCursor(input.cursor) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: {
      id: true,
      version: true,
      status: true,
      createdAt: true,
      locale: true,
      changeNotes: true,
    },
  });
  return { template, versions: cursorPage(rows, input.limit) };
}

export async function getTemplateVersionAdministration(
  actor: ActorContext,
  raw: unknown
) {
  requirePermission(actor, "admin:template:read");
  const input = parseWithSchema(
    z.object({ templateId: entityIdSchema, versionId: entityIdSchema }),
    raw
  );
  const version = await prisma.requestTemplateVersion.findFirst({
    where: {
      id: input.versionId,
      templateId: input.templateId,
      template: { deletedAt: null },
    },
    include: {
      template: { include: { jurisdiction: { select: { name: true, code: true } } } },
    },
  });
  if (!version) throw new NotFoundError("This version does not belong to this template.");
  return version;
}

async function lockTemplate(
  tx: PrismaTransaction,
  scope: z.infer<typeof templateScopeSchema>
) {
  await tx.$executeRaw`SELECT 1 FROM "RequestTemplate" WHERE id = ${scope.templateId} FOR UPDATE`;
  const row = await tx.requestTemplate.findFirst({
    where: { id: scope.templateId, deletedAt: null },
  });
  if (!row) throw new NotFoundError("This template does not exist.");
  assertCatalogueRevision(row.updatedAt, scope.expectedUpdatedAt);
  return row;
}

async function touchTemplate(
  tx: PrismaTransaction,
  actor: ActorContext,
  template: RequestTemplate,
  data: { isActive?: boolean; name?: string; description?: string } = {}
) {
  await tx.requestTemplate.update({
    where: { id: template.id },
    data: {
      ...data,
      updatedById: actor.userId,
      updatedAt: nextCatalogueRevision(template.updatedAt),
    },
  });
}

async function getVersion(tx: PrismaTransaction, templateId: string, versionId: string) {
  const version = await tx.requestTemplateVersion.findFirst({
    where: { id: versionId, templateId },
  });
  if (!version) throw new NotFoundError("This version does not belong to this template.");
  return version;
}

function requireDraft(status: string) {
  if (status !== "DRAFT")
    throw new AppError({
      code: "CONFLICT",
      message:
        "Published and retired versions cannot be edited. Create a new draft from this version.",
    });
}

export async function createTemplateRecord(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:template:manage");
  const command = parseWithSchema(createTemplateSchema, raw);
  const prepared = prepareTemplateSource(command);
  return translateCatalogueConflict(() =>
    prisma.$transaction(async (tx) => {
      await lockAuthorizedAccount(tx, actor, "admin:template:manage");
      const lock = `catalogue:template:${command.key}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))`;
      if (
        command.jurisdictionId &&
        !(await tx.jurisdiction.findFirst({
          where: { id: command.jurisdictionId, isActive: true },
          select: { id: true },
        }))
      )
        throw new NotFoundError("Choose an active jurisdiction.");
      const template = await tx.requestTemplate.create({
        data: {
          key: command.key,
          name: command.name,
          description: command.description,
          requestType: command.requestType,
          channel: command.channel,
          jurisdictionId: command.jurisdictionId || null,
          isActive: false,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      const version = await tx.requestTemplateVersion.create({
        data: {
          templateId: template.id,
          version: 1,
          status: "DRAFT",
          ...prepared.source,
          checksum: prepared.checksum,
          requiredVariables: prepared.requiredVariables,
          optionalVariables: prepared.optionalVariables,
          createdById: actor.userId,
        },
        select: { id: true },
      });
      return { templateId: template.id, versionId: version.id };
    })
  );
}

export async function updateTemplateMetadata(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:template:manage");
  const command = parseWithSchema(templateMetadataSchema, raw);
  return prisma.$transaction(async (tx) => {
    await lockAuthorizedAccount(tx, actor, "admin:template:manage");
    const template = await lockTemplate(tx, command);
    await touchTemplate(tx, actor, template, {
      name: command.name,
      description: command.description,
    });
    return { templateId: template.id };
  });
}

export async function startTemplateDraft(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:template:manage");
  const command = parseWithSchema(templateVersionScopeSchema, raw);
  return prisma.$transaction(async (tx) => {
    await lockAuthorizedAccount(tx, actor, "admin:template:manage");
    const template = await lockTemplate(tx, command);
    const source = await getVersion(tx, template.id, command.versionId);
    const latest = await tx.requestTemplateVersion.findFirst({
      where: { templateId: template.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = await tx.requestTemplateVersion.create({
      data: {
        subjectTemplate: source.subjectTemplate,
        bodyTemplate: source.bodyTemplate,
        locale: source.locale,
        changeNotes: "",
        templateId: template.id,
        version: (latest?.version ?? 0) + 1,
        status: "DRAFT",
        checksum: sha256Hex(`${source.subjectTemplate}\n${source.bodyTemplate}`),
        requiredVariables: source.requiredVariables,
        optionalVariables: source.optionalVariables,
        createdById: actor.userId,
      },
      select: { id: true },
    });
    await touchTemplate(tx, actor, template);
    return { templateId: template.id, versionId: version.id };
  });
}

export async function saveTemplateDraft(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:template:manage");
  const command = parseWithSchema(saveTemplateDraftSchema, raw);
  const prepared = prepareTemplateSource(command);
  return prisma.$transaction(async (tx) => {
    await lockAuthorizedAccount(tx, actor, "admin:template:manage");
    const template = await lockTemplate(tx, command);
    const version = await getVersion(tx, template.id, command.versionId);
    requireDraft(version.status);
    await tx.requestTemplateVersion.update({
      where: { id: version.id },
      data: {
        ...prepared.source,
        checksum: prepared.checksum,
        requiredVariables: prepared.requiredVariables,
        optionalVariables: prepared.optionalVariables,
        updatedAt: nextCatalogueRevision(version.updatedAt),
      },
    });
    await touchTemplate(tx, actor, template);
    return { templateId: template.id, versionId: version.id };
  });
}

async function lockTemplateScope(tx: PrismaTransaction, templateId: string) {
  const parent = await tx.requestTemplate.findFirst({
    where: { id: templateId, deletedAt: null },
  });
  if (!parent) throw new NotFoundError("This template does not exist.");
  const lock = `catalogue:template-scope:${parent.requestType}:${parent.channel}:${parent.jurisdictionId ?? "generic"}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))`;
  // All replacements acquire parent rows in the same order, even across template keys.
  await tx.$executeRaw`SELECT id FROM "RequestTemplate"
    WHERE "requestType" = ${parent.requestType}::"RequestType" AND channel = ${parent.channel}::"RequestChannel"
      AND "jurisdictionId" IS NOT DISTINCT FROM ${parent.jurisdictionId}
    ORDER BY id FOR UPDATE`;
  return parent;
}

export async function publishTemplateVersion(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:template:manage");
  const command = parseWithSchema(publishTemplateSchema, raw);
  return prisma.$transaction(async (tx) => {
    await lockAuthorizedAccount(tx, actor, "admin:template:manage");
    await lockTemplateScope(tx, command.templateId);
    const template = await lockTemplate(tx, command);
    const version = await getVersion(tx, template.id, command.versionId);
    requireDraft(version.status);
    const prepared = validateTemplatePublication(version);
    if (prepared.checksum !== command.checksum || version.checksum !== command.checksum)
      throw new AppError({
        code: "CONFLICT",
        message: "The saved preview changed. Reload and review it before publishing.",
      });
    if (
      template.jurisdictionId &&
      !(await tx.jurisdiction.findFirst({
        where: { id: template.jurisdictionId, isActive: true },
        select: { id: true },
      }))
    )
      throw new AppError({
        code: "VALIDATION_FAILED",
        message:
          "Activate and review this jurisdiction before publishing a template for it.",
      });
    // A single active parent per scope makes selection deterministic. Retired
    // parent/version rows remain available to every historical request.
    const replaced = await tx.requestTemplate.findMany({
      where: {
        id: { not: template.id },
        requestType: template.requestType,
        channel: template.channel,
        jurisdictionId: template.jurisdictionId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, updatedAt: true },
    });
    for (const row of replaced)
      await tx.requestTemplate.update({
        where: { id: row.id },
        data: {
          isActive: false,
          updatedById: actor.userId,
          updatedAt: nextCatalogueRevision(row.updatedAt),
        },
      });
    await tx.requestTemplateVersion.updateMany({
      where: { templateId: template.id, status: "PUBLISHED" },
      data: { status: "SUPERSEDED" },
    });
    await tx.requestTemplateVersion.update({
      where: { id: version.id },
      data: { status: "PUBLISHED" },
    });
    await touchTemplate(tx, actor, template, { isActive: true });
    return {
      templateId: template.id,
      versionId: version.id,
      replacedTemplates: replaced.length,
    };
  });
}

export async function deactivateTemplate(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:template:manage");
  const command = parseWithSchema(templateScopeSchema, raw);
  return prisma.$transaction(async (tx) => {
    await lockAuthorizedAccount(tx, actor, "admin:template:manage");
    await lockTemplateScope(tx, command.templateId);
    const template = await lockTemplate(tx, command);
    await touchTemplate(tx, actor, template, { isActive: false });
    return { templateId: template.id };
  });
}
