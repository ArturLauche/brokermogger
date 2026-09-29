import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  brokerCommandSchema,
  type brokerEditScope,
  contactCommandSchema,
  coverageCommandSchema,
  sendingCommandSchema,
} from "@/lib/admin/brokerCommands";
import { evaluateBrokerSendable } from "@/lib/brokers/sendable";
import { AppError, NotFoundError } from "@/lib/core/errors";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { pageInputSchema, createdBeforeCursor, cursorPage } from "@/lib/pagination";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { publicUrlSchema } from "@/lib/validation/publicUrl";
import { lockActiveAccount } from "./access";

const listSchema = pageInputSchema.extend({
  search: z.string().trim().max(100).default(""),
  status: z.enum(["all", "sending", "unverified", "inactive"]).default("all"),
});
export async function listBrokerAdministration(actor: ActorContext, raw: unknown = {}) {
  requirePermission(actor, "admin:broker:read");
  const input = parseWithSchema(listSchema, raw);
  const where: Prisma.BrokerWhereInput = {
    deletedAt: null,
    ...(input.search
      ? {
          OR: [
            { legalName: { contains: input.search, mode: "insensitive" } },
            { slug: { contains: input.search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(input.status === "sending"
      ? { productionSendingEnabled: true }
      : input.status === "inactive"
        ? { isActive: false }
        : input.status === "unverified"
          ? { verificationStatus: { in: ["UNVERIFIED", "SOURCE_FOUND"] } }
          : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.broker.findMany({
      where: { AND: [where, createdBeforeCursor(input.cursor)] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      select: {
        id: true,
        createdAt: true,
        legalName: true,
        category: true,
        verificationStatus: true,
        productionSendingEnabled: true,
        isDemoData: true,
        isActive: true,
      },
    }),
    prisma.broker.count({ where }),
  ]);
  return { ...cursorPage(rows, input.limit), total };
}

export async function getBrokerAdministration(actor: ActorContext, rawId: string) {
  requirePermission(actor, "admin:broker:read");
  const id = parseWithSchema(entityIdSchema, rawId);
  const broker = await prisma.broker.findFirst({
    where: { id, deletedAt: null },
    include: {
      contactMethods: {
        where: { deletedAt: null },
        orderBy: [{ priority: "asc" }, { id: "asc" }],
      },
      jurisdictionCoverage: {
        include: { jurisdiction: { select: { name: true, code: true } } },
        orderBy: { jurisdictionId: "asc" },
      },
      seedSources: { orderBy: { retrievedAt: "desc" } },
    },
  });
  if (!broker) throw new NotFoundError("This broker does not exist.");
  return broker;
}

async function lockBroker(
  tx: PrismaTransaction,
  actor: ActorContext,
  scope: z.infer<typeof brokerEditScope>
) {
  await lockActiveAccount(tx, actor.userId);
  await tx.$executeRaw`SELECT 1 FROM "Broker" WHERE id = ${scope.brokerId} FOR UPDATE`;
  const broker = await tx.broker.findFirst({
    where: { id: scope.brokerId, deletedAt: null },
  });
  if (!broker) throw new NotFoundError("This broker does not exist.");
  if (broker.updatedAt.toISOString() !== scope.expectedUpdatedAt)
    throw new AppError({
      code: "CONFLICT",
      message:
        "This broker changed in another session. Reload to review its current configuration before saving.",
    });
  return broker;
}

async function translateConflict<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002")
      throw new AppError({
        code: "CONFLICT",
        message:
          "This broker slug or contact method already exists. Edit the existing entry instead.",
      });
    throw error;
  }
}

/** Every catalogue edit disables sending until an operator reviews the final configuration. */
export async function saveBrokerRecord(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:broker:manage");
  const {
    brokerId,
    expectedUpdatedAt,
    expectsIdentityDocument,
    accountRequired,
    notarisationRequired,
    verificationInstructions,
    ...command
  } = parseWithSchema(brokerCommandSchema, raw);
  const data = {
    ...command,
    websiteUrl: command.websiteUrl || null,
    sourceUrl: command.sourceUrl || null,
    lastVerifiedAt: command.lastVerifiedAt
      ? new Date(`${command.lastVerifiedAt}T00:00:00Z`)
      : null,
    productionSendingEnabled: false,
    updatedById: actor.userId,
    verificationRequirements: {
      identityDocument: expectsIdentityDocument,
      accountRequired,
      notarised: notarisationRequired,
      notes: verificationInstructions,
    },
  };
  return translateConflict(() =>
    prisma.$transaction(async (tx) => {
      if (brokerId) {
        const current = await lockBroker(tx, actor, { brokerId, expectedUpdatedAt });
        return tx.broker.update({
          where: { id: brokerId },
          data: { ...data, updatedAt: nextRevisionDate(current.updatedAt) },
          select: { id: true, updatedAt: true },
        });
      }
      await lockActiveAccount(tx, actor.userId);
      return tx.broker.create({
        data: { ...data, createdById: actor.userId },
        select: { id: true, updatedAt: true },
      });
    })
  );
}

export async function saveBrokerContact(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:broker:manage");
  const { brokerId, expectedUpdatedAt, contactId, ...command } = parseWithSchema(
    contactCommandSchema,
    raw
  );
  return translateConflict(() =>
    prisma.$transaction(async (tx) => {
      const current = await lockBroker(tx, actor, { brokerId, expectedUpdatedAt });
      if (
        contactId &&
        !(await tx.brokerContactMethod.findFirst({
          where: { id: contactId, brokerId, deletedAt: null },
          select: { id: true },
        }))
      )
        throw new NotFoundError("This contact does not belong to this broker.");
      if (command.isPreferred)
        await tx.brokerContactMethod.updateMany({
          where: { brokerId, isPreferred: true },
          data: { isPreferred: false, updatedById: actor.userId },
        });
      const data = {
        ...command,
        sourceUrl: command.sourceUrl || null,
        verifiedAt:
          command.isVerified && command.verifiedAt
            ? new Date(`${command.verifiedAt}T00:00:00Z`)
            : null,
        verifiedBy: command.isVerified ? actor.userId : null,
        updatedById: actor.userId,
      };
      if (contactId)
        await tx.brokerContactMethod.update({ where: { id: contactId }, data });
      else
        await tx.brokerContactMethod.create({
          data: { ...data, brokerId, createdById: actor.userId },
        });
      return tx.broker.update({
        where: { id: brokerId },
        data: {
          productionSendingEnabled: false,
          updatedById: actor.userId,
          updatedAt: nextRevisionDate(current.updatedAt),
        },
        select: { id: true, updatedAt: true },
      });
    })
  );
}

export async function saveBrokerCoverage(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:broker:manage");
  const { brokerId, expectedUpdatedAt, jurisdictionId, ...data } = parseWithSchema(
    coverageCommandSchema,
    raw
  );
  return prisma.$transaction(async (tx) => {
    const current = await lockBroker(tx, actor, { brokerId, expectedUpdatedAt });
    if (
      !(await tx.jurisdiction.findFirst({
        where: { id: jurisdictionId, ...(data.isActive ? { isActive: true } : {}) },
        select: { id: true },
      }))
    )
      throw new NotFoundError("Choose an active jurisdiction.");
    await tx.brokerJurisdictionCoverage.upsert({
      where: { brokerId_jurisdictionId: { brokerId, jurisdictionId } },
      create: { brokerId, jurisdictionId, ...data },
      update: data,
    });
    return tx.broker.update({
      where: { id: brokerId },
      data: {
        productionSendingEnabled: false,
        updatedById: actor.userId,
        updatedAt: nextRevisionDate(current.updatedAt),
      },
      select: { id: true, updatedAt: true },
    });
  });
}

export async function changeBrokerSending(actor: ActorContext, raw: unknown) {
  requirePermission(actor, "admin:broker:manage");
  const command = parseWithSchema(sendingCommandSchema, raw);
  return prisma.$transaction(async (tx) => {
    const broker = await lockBroker(tx, actor, command);
    if (command.enabled) {
      const [contactMethods, coverage] = await Promise.all([
        tx.brokerContactMethod.findMany({
          where: { brokerId: broker.id, isActive: true, deletedAt: null },
        }),
        tx.brokerJurisdictionCoverage.count({
          where: {
            brokerId: broker.id,
            isActive: true,
            supportedRequestTypes: { isEmpty: false },
            coverageType: { in: ["STATUTORY", "VOLUNTARY_OPT_OUT"] },
            jurisdiction: { isActive: true },
          },
        }),
      ]);
      const decision = evaluateBrokerSendable({
        ...broker,
        productionSendingEnabled: true,
        contactMethods: contactMethods.filter(
          (method) =>
            method.verifiedAt &&
            method.verifiedAt <= new Date() &&
            method.verificationNote &&
            method.verificationNote.length >= 10 &&
            publicUrlSchema.safeParse(method.sourceUrl).success
        ),
        hasJurisdictionCoverage: coverage > 0,
      });
      if (!decision.sendable)
        throw new AppError({
          code: "BROKER_NOT_SENDABLE",
          message: decision.reasons.join(" "),
        });
    }
    return tx.broker.update({
      where: { id: broker.id },
      data: {
        productionSendingEnabled: command.enabled,
        updatedById: actor.userId,
        updatedAt: nextRevisionDate(broker.updatedAt),
      },
      select: { id: true, updatedAt: true },
    });
  });
}

/** A successful edit must invalidate the previous token, even within one millisecond. */
function nextRevisionDate(previous: Date) {
  return new Date(Math.max(Date.now(), previous.getTime() + 1));
}
