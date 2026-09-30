/** Public legal configuration; writes are fenced by current role and parent revision. */
import { Prisma, type LegalRule, type LegalRuleVersion } from "@prisma/client";
import { z } from "zod";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { AppError, NotFoundError, ValidationError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { pageInputSchema, createdBeforeCursor, cursorPage } from "@/lib/pagination";
import { entityIdSchema } from "@/lib/validation/ids";
import { parseWithSchema } from "@/lib/validation/form";
import {
  legalSourceFromVersion,
  prepareLegalSource,
  validateLegalPublication,
} from "@/lib/jurisdiction/authoring";
import {
  createLegalRuleSchema,
  legalRuleMetadataSchema,
  legalRuleScopeSchema,
  legalRuleVersionScopeSchema,
  saveLegalDraftSchema,
  publishLegalRuleSchema,
} from "@/lib/admin/legalRuleCommands";
import { lockAuthorizedAccount } from "./access";
import {
  assertCatalogueRevision,
  nextCatalogueRevision,
  translateCatalogueConflict,
} from "./catalogueEditing";

const listSchema = pageInputSchema.extend({
  search: z.string().trim().max(100).default(""),
  status: z.enum(["all", "draft", "published", "inactive", "scheduled"]).default("all"),
  jurisdictionId: entityIdSchema.or(z.literal("")).default(""),
});
export async function listLegalRuleAdministration(
  actor: ActorContext,
  raw: unknown = {}
) {
  requirePermission(actor, "admin:legalRule:read");
  const input = parseWithSchema(listSchema, raw);
  const now = new Date();
  const where: Prisma.LegalRuleWhereInput = {
    deletedAt: null,
    ...(input.search
      ? {
          OR: ["lawName", "shortName", "key"].map((key) => ({
            [key]: { contains: input.search, mode: "insensitive" },
          })),
        }
      : {}),
    ...(input.jurisdictionId ? { jurisdictionId: input.jurisdictionId } : {}),
    ...(input.status === "inactive" ? { isActive: false } : {}),
    ...(input.status === "draft" ? { versions: { some: { status: "DRAFT" } } } : {}),
    ...(input.status === "published"
      ? {
          isActive: true,
          versions: { some: { status: "PUBLISHED", effectiveFrom: { lte: now } } },
        }
      : {}),
    ...(input.status === "scheduled"
      ? {
          isActive: true,
          versions: { some: { status: "PUBLISHED", effectiveFrom: { gt: now } } },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.legalRule.findMany({
      where: { AND: [where, createdBeforeCursor(input.cursor)] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      select: {
        id: true,
        key: true,
        lawName: true,
        shortName: true,
        createdAt: true,
        isActive: true,
        jurisdiction: { select: { name: true, code: true } },
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: {
            version: true,
            status: true,
            confidence: true,
            requiresLegalReview: true,
            lastReviewedAt: true,
            effectiveFrom: true,
          },
        },
      },
    }),
    prisma.legalRule.count({ where }),
  ]);
  return { ...cursorPage(rows, input.limit), total };
}
export async function getLegalRuleAdministration(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:legalRule:read");
  const input = parseWithSchema(
    pageInputSchema.extend({ legalRuleId: entityIdSchema }),
    raw
  );
  const legalRule = await prisma.legalRule.findFirst({
    where: { id: input.legalRuleId, deletedAt: null },
    include: { jurisdiction: { select: { name: true, code: true } } },
  });
  if (!legalRule) throw new NotFoundError("This legal rule does not exist.");
  const rows = await prisma.legalRuleVersion.findMany({
    where: { legalRuleId: legalRule.id, ...createdBeforeCursor(input.cursor) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: {
      id: true,
      version: true,
      status: true,
      createdAt: true,
      confidence: true,
      requiresLegalReview: true,
      lastReviewedAt: true,
      effectiveFrom: true,
      effectiveUntil: true,
      changeNotes: true,
    },
  });
  return { legalRule, versions: cursorPage(rows, input.limit) };
}
export async function getLegalVersionAdministration(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:legalRule:read");
  const input = parseWithSchema(
    z.object({ legalRuleId: entityIdSchema, versionId: entityIdSchema }),
    raw
  );
  const version = await prisma.legalRuleVersion.findFirst({
    where: {
      id: input.versionId,
      legalRuleId: input.legalRuleId,
      legalRule: { deletedAt: null },
    },
    include: {
      legalRule: { include: { jurisdiction: { select: { name: true, code: true } } } },
    },
  });
  if (!version)
    throw new NotFoundError("This version does not belong to this legal rule.");
  return version;
}

async function lockRule(
  tx: PrismaTransaction,
  actor: ActorContext,
  scope: z.infer<typeof legalRuleScopeSchema>
) {
  await lockAuthorizedAccount(tx, actor, "admin:legalRule:manage");
  await tx.$executeRaw`SELECT 1 FROM "LegalRule" WHERE id = ${scope.legalRuleId} FOR UPDATE`;
  const row = await tx.legalRule.findFirst({
    where: { id: scope.legalRuleId, deletedAt: null },
  });
  if (!row) throw new NotFoundError("This legal rule does not exist.");
  assertCatalogueRevision(row.updatedAt, scope.expectedUpdatedAt);
  return row;
}
async function touchRule(
  tx: PrismaTransaction,
  actor: ActorContext,
  rule: LegalRule,
  data: {
    isActive?: boolean;
    lawName?: string;
    shortName?: string;
    description?: string;
  } = {}
) {
  await tx.legalRule.update({
    where: { id: rule.id },
    data: {
      ...data,
      updatedById: actor.userId,
      updatedAt: nextCatalogueRevision(rule.updatedAt),
    },
  });
}
async function getVersion(tx: PrismaTransaction, legalRuleId: string, versionId: string) {
  const version = await tx.legalRuleVersion.findFirst({
    where: { id: versionId, legalRuleId },
  });
  if (!version)
    throw new NotFoundError("This version does not belong to this legal rule.");
  return version;
}
function requireDraft(version: LegalRuleVersion) {
  if (version.status !== "DRAFT")
    throw new AppError({
      code: "CONFLICT",
      message: "Published and retired versions cannot be edited. Start a new draft.",
    });
}

export async function createLegalRuleRecord(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:legalRule:manage");
  const command = parseWithSchema(createLegalRuleSchema, raw);
  const prepared = prepareLegalSource(command);
  return translateCatalogueConflict(() =>
    prisma.$transaction(async (tx) => {
      await lockAuthorizedAccount(tx, actor, "admin:legalRule:manage");
      const key = "catalogue:legal:" + command.jurisdictionId + ":" + command.key;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      if (
        !(await tx.jurisdiction.findFirst({
          where: { id: command.jurisdictionId, isActive: true },
          select: { id: true },
        }))
      )
        throw new NotFoundError("Choose an active jurisdiction.");
      const rule = await tx.legalRule.create({
        data: {
          jurisdictionId: command.jurisdictionId,
          key: command.key,
          lawName: command.lawName,
          shortName: command.shortName,
          description: command.description,
          isActive: false,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      const version = await tx.legalRuleVersion.create({
        data: {
          legalRuleId: rule.id,
          version: 1,
          status: "DRAFT",
          ...prepared.content,
          createdById: actor.userId,
        },
        select: { id: true },
      });
      return { legalRuleId: rule.id, versionId: version.id };
    })
  );
}
export async function updateLegalRuleMetadata(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:legalRule:manage");
  const command = parseWithSchema(legalRuleMetadataSchema, raw);
  return prisma.$transaction(async (tx) => {
    const rule = await lockRule(tx, actor, command);
    await touchRule(tx, actor, rule, {
      lawName: command.lawName,
      shortName: command.shortName,
      description: command.description,
    });
    return { legalRuleId: rule.id };
  });
}
export async function startLegalRuleDraft(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:legalRule:manage");
  const command = parseWithSchema(legalRuleVersionScopeSchema, raw);
  return prisma.$transaction(async (tx) => {
    const rule = await lockRule(tx, actor, command);
    const source = await getVersion(tx, rule.id, command.versionId);
    const latest = await tx.legalRuleVersion.findFirst({
      where: { legalRuleId: rule.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const {
      id: _id,
      legalRuleId: _ruleId,
      version: _version,
      status: _status,
      createdAt: _created,
      updatedAt: _updated,
      createdById: _author,
      ...content
    } = source;
    const version = await tx.legalRuleVersion.create({
      data: {
        ...content,
        legalRuleId: rule.id,
        version: (latest?.version ?? 0) + 1,
        status: "DRAFT",
        deadlineRule: content.deadlineRule ?? Prisma.JsonNull,
        verificationRequirements: content.verificationRequirements ?? Prisma.JsonNull,
        templateClauses: content.templateClauses ?? Prisma.JsonNull,
        additionalSources: content.additionalSources ?? Prisma.JsonNull,
        changeNotes: "",
        createdById: actor.userId,
      },
      select: { id: true },
    });
    await touchRule(tx, actor, rule);
    return { legalRuleId: rule.id, versionId: version.id };
  });
}
export async function saveLegalRuleDraft(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:legalRule:manage");
  const command = parseWithSchema(saveLegalDraftSchema, raw);
  const prepared = prepareLegalSource(command);
  return prisma.$transaction(async (tx) => {
    const rule = await lockRule(tx, actor, command);
    const version = await getVersion(tx, rule.id, command.versionId);
    requireDraft(version);
    await tx.legalRuleVersion.update({
      where: { id: version.id },
      data: prepared.content,
    });
    await touchRule(tx, actor, rule);
    return { legalRuleId: rule.id, versionId: version.id };
  });
}
export async function publishLegalRuleVersion(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:legalRule:manage");
  const command = parseWithSchema(publishLegalRuleSchema, raw);
  return prisma.$transaction(async (tx) => {
    const rule = await lockRule(tx, actor, command);
    const version = await getVersion(tx, rule.id, command.versionId);
    requireDraft(version);
    const prepared = validateLegalPublication(legalSourceFromVersion(version));
    if (prepared.checksum !== command.checksum)
      throw new AppError({
        code: "CONFLICT",
        message:
          "This saved source changed. Reload and review its preview before publishing.",
      });
    if (
      !(await tx.jurisdiction.findFirst({
        where: { id: rule.jurisdictionId, isActive: true },
        select: { id: true },
      }))
    )
      throw new ValidationError(
        "This jurisdiction is inactive. It cannot publish new rules."
      );
    const now = new Date();
    const current = await tx.legalRuleVersion.findFirst({
      where: {
        legalRuleId: rule.id,
        status: { in: ["PUBLISHED", "SUPERSEDED", "ARCHIVED"] },
        effectiveFrom: { lte: now },
      },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      select: { effectiveFrom: true },
    });
    if (current && version.effectiveFrom < current.effectiveFrom)
      throw new ValidationError("This version would precede the current publication.", {
        fieldErrors: {
          effectiveFrom:
            "Use an effective start on or after the current version, or leave this version as a historical draft.",
        },
      });
    await tx.legalRuleVersion.update({
      where: { id: version.id },
      data: { status: "PUBLISHED" },
    });
    // Scheduling a future version must leave currently applicable content published.
    if (!rule.isActive)
      await tx.legalRuleVersion.updateMany({
        where: { legalRuleId: rule.id, id: { not: version.id }, status: "PUBLISHED" },
        data: { status: "ARCHIVED" },
      });
    else if (version.effectiveFrom <= now)
      await tx.legalRuleVersion.updateMany({
        where: {
          legalRuleId: rule.id,
          id: { not: version.id },
          status: "PUBLISHED",
          effectiveFrom: { lte: version.effectiveFrom },
        },
        data: { status: "SUPERSEDED" },
      });
    await touchRule(tx, actor, rule, { isActive: true });
    return { legalRuleId: rule.id, versionId: version.id };
  });
}
export async function deactivateLegalRuleRecord(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:legalRule:manage");
  const command = parseWithSchema(legalRuleScopeSchema, raw);
  return prisma.$transaction(async (tx) => {
    const rule = await lockRule(tx, actor, command);
    await touchRule(tx, actor, rule, { isActive: false });
    return { legalRuleId: rule.id };
  });
}
