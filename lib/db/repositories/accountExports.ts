import { randomUUID } from "node:crypto";
import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { AppError, NotFoundError } from "@/lib/core/errors";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { exportInputSchema } from "@/lib/exports/validation";
import { EXPORT_NOTICE_VERSION, SENSITIVE_EXPORT_NOTICE } from "@/lib/exports/notices";
import { sha256Hex } from "@/lib/security/crypto";
import { parseJobPayload } from "@/lib/jobs/payloads";
import type { ClaimedJob } from "@/lib/jobs/types";
import { pageInputSchema, createdBeforeCursor, cursorPage } from "@/lib/pagination";
import { lockActiveAccount } from "./access";
import { lockJobLeaseInTx } from "./jobLease";
import { createNotificationInTx } from "./notifications";

type ExportJob = ClaimedJob<"GENERATE_ACCOUNT_EXPORT">;
const DAY = 86_400_000;

export async function createAccountExport(actor: ActorContext, raw: unknown) {
  const input = parseWithSchema(exportInputSchema, raw);
  requirePermission(
    actor,
    input.mode === "SENSITIVE" ? "account:exportSensitive" : "account:export",
    { ownerUserId: actor.userId }
  );
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, actor.userId);
    const submissionKey = `${actor.userId}:${input.submissionKey}`;
    const existing = await tx.accountExport.findUnique({ where: { submissionKey } });
    if (existing?.deletedAt)
      throw new AppError({
        code: "CONFLICT",
        message: "This copy was deleted. Refresh to request a new export.",
      });
    if (existing && !existing.deletedAt) {
      if (existing.mode !== input.mode)
        throw new AppError({
          code: "CONFLICT",
          message:
            "This form already requested a different copy. Refresh to create another.",
        });
      return { id: existing.id };
    }
    // One generation per mode protects worker capacity without a plan or paywall.
    const active = await tx.accountExport.findFirst({
      where: {
        userId: actor.userId,
        mode: input.mode,
        deletedAt: null,
        job: { status: { in: ["PENDING", "RUNNING", "RETRYABLE"] } },
      },
      select: { id: true },
    });
    if (active) return active;
    const data = await tx.accountExport.create({
      data: {
        id: randomUUID(),
        userId: actor.userId,
        mode: input.mode,
        submissionKey,
        ...(input.mode === "SENSITIVE"
          ? {
              consentedAt: new Date(),
              consentVersion: EXPORT_NOTICE_VERSION,
              consentStatementHash: sha256Hex(SENSITIVE_EXPORT_NOTICE),
            }
          : {}),
      },
      select: { id: true },
    });
    const job = await tx.backgroundJob.create({
      data: {
        type: "GENERATE_ACCOUNT_EXPORT",
        payloadJson: parseJobPayload("GENERATE_ACCOUNT_EXPORT", { exportId: data.id }),
        relatedUserId: actor.userId,
        idempotencyKey: `account-export:${data.id}`,
        maxAttempts: 3,
      },
      select: { id: true },
    });
    await tx.accountExport.update({ where: { id: data.id }, data: { jobId: job.id } });
    return data;
  });
}

export async function listAccountExports(actor: ActorContext, raw: unknown = {}) {
  requirePermission(actor, "account:export", { ownerUserId: actor.userId });
  const input = parseWithSchema(pageInputSchema, raw);
  const rows = await prisma.accountExport.findMany({
    where: {
      userId: actor.userId,
      deletedAt: null,
      user: { status: "ACTIVE", deletionRequestedAt: null },
      ...createdBeforeCursor(input.cursor),
    },
    select: {
      id: true,
      mode: true,
      status: true,
      createdAt: true,
      generatedAt: true,
      expiresAt: true,
      processedRecords: true,
      error: true,
      evidenceFile: { select: { id: true, deletedAt: true, storageState: true } },
      job: { select: { status: true, runAt: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
  return cursorPage(rows, input.limit);
}

export async function getExportForDownload(actor: ActorContext, rawId: unknown) {
  requirePermission(actor, "account:export", { ownerUserId: actor.userId });
  const id = parseWithSchema(entityIdSchema, rawId);
  const data = await prisma.accountExport.findFirst({
    where: {
      id,
      userId: actor.userId,
      deletedAt: null,
      status: "READY",
      expiresAt: { gt: new Date() },
      user: { status: "ACTIVE", deletionRequestedAt: null },
    },
    select: { id: true, mode: true, evidenceFileId: true },
  });
  if (!data?.evidenceFileId)
    throw new NotFoundError(
      "This export is not ready, has expired or is no longer available."
    );
  return data;
}

/** Caller holds the account lock. Used by every explicit content-erasure path. */
export async function invalidateAccountExportsInTx(
  tx: PrismaTransaction,
  userId: string
) {
  await tx.backgroundJob.updateMany({
    where: {
      relatedUserId: userId,
      type: "GENERATE_ACCOUNT_EXPORT",
      status: { in: ["PENDING", "RUNNING", "RETRYABLE"] },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      leaseToken: null,
      lockedAt: null,
      lockedBy: null,
      lockExpiresAt: null,
    },
  });
  await tx.evidenceFile.updateMany({
    where: { userId, kind: "ACCOUNT_EXPORT", storageState: { not: "PURGED" } },
    data: {
      storageState: "PURGE_PENDING",
      purgeRequestedAt: new Date(),
      deletedAt: new Date(),
      filenameEnc: null,
      filenameMasked: null,
    },
  });
  await tx.accountExport.deleteMany({ where: { userId } });
  await tx.notification.deleteMany({ where: { userId, type: "ACCOUNT_EXPORT_READY" } });
}

export async function deleteOwnedAccountExport(actor: ActorContext, rawId: unknown) {
  const id = parseWithSchema(entityIdSchema, rawId);
  const ref = await prisma.accountExport.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!ref) throw new NotFoundError("This export does not exist.");
  requirePermission(actor, "account:export", { ownerUserId: ref.userId });
  return prisma.$transaction(async (tx) => {
    await lockActiveAccount(tx, ref.userId);
    const data = await tx.accountExport.findUniqueOrThrow({ where: { id } });
    if (data.jobId)
      await tx.backgroundJob.updateMany({
        where: { id: data.jobId, status: { in: ["PENDING", "RUNNING", "RETRYABLE"] } },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          leaseToken: null,
          lockedAt: null,
          lockedBy: null,
          lockExpiresAt: null,
        },
      });
    await tx.accountExport.update({
      where: { id },
      data: { deletedAt: new Date(), generationLeaseToken: null },
    });
    if (data.evidenceFileId)
      await tx.evidenceFile.updateMany({
        where: { id: data.evidenceFileId, storageState: { not: "PURGED" } },
        data: {
          storageState: "PURGE_PENDING",
          purgeRequestedAt: new Date(),
          deletedAt: new Date(),
        },
      });
    await tx.backgroundJob.upsert({
      where: { idempotencyKey: `export-purge:${id}` },
      create: {
        type: "PURGE_EVIDENCE",
        payloadJson: parseJobPayload("PURGE_EVIDENCE", {
          olderThanIso: new Date().toISOString(),
        }),
        relatedUserId: ref.userId,
        idempotencyKey: `export-purge:${id}`,
      },
      update: {},
    });
  });
}

/** Also used by each source-page read. Account -> job is the shared lock order. */
export async function currentExportInTx(tx: PrismaTransaction, job: ExportJob) {
  const ref = await tx.accountExport.findFirst({
    where: { id: job.payload.exportId, deletedAt: null },
    select: { userId: true },
  });
  if (!ref) return null;
  await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ref.userId} FOR UPDATE`;
  if (
    !(await lockJobLeaseInTx(tx, job, "GENERATE_ACCOUNT_EXPORT", {
      exportId: job.payload.exportId,
    }))
  )
    return null;
  if (
    !(await tx.user.findFirst({
      where: {
        id: ref.userId,
        status: "ACTIVE",
        deletionRequestedAt: null,
        deletedAt: null,
      },
      select: { id: true },
    }))
  )
    return null;
  const data = await tx.accountExport.findFirst({
    where: { id: job.payload.exportId, deletedAt: null, jobId: job.id },
  });
  if (
    data?.mode === "SENSITIVE" &&
    (!data.consentedAt ||
      data.consentedAt.getTime() + DAY <= Date.now() ||
      data.consentVersion !== EXPORT_NOTICE_VERSION ||
      data.consentStatementHash !== sha256Hex(SENSITIVE_EXPORT_NOTICE))
  ) {
    if (data.status !== "READY")
      await tx.accountExport.update({
        where: { id: data.id },
        data: {
          status: "FAILED",
          error: "Sensitive export approval expired or changed. Confirm a new export.",
          generationLeaseToken: null,
        },
      });
    return null;
  }
  return data;
}

export async function beginAccountExport(job: ExportJob) {
  return prisma.$transaction(async (tx) => {
    const data = await currentExportInTx(tx, job);
    if (
      !data ||
      data.status === "READY" ||
      (data.status === "GENERATING" && data.generationLeaseToken === job.leaseToken)
    )
      return null;
    return tx.accountExport.update({
      where: { id: data.id },
      data: {
        status: "GENERATING",
        generationLeaseToken: job.leaseToken,
        sourceCutoffAt: new Date(),
        processedRecords: 0,
        error: null,
      },
    });
  });
}
export async function failAccountExport(job: ExportJob) {
  return prisma.$transaction(async (tx) => {
    const data = await currentExportInTx(tx, job);
    if (data?.status === "GENERATING" && data.generationLeaseToken === job.leaseToken)
      await tx.accountExport.update({
        where: { id: data.id },
        data: {
          status: "FAILED",
          generationLeaseToken: null,
          error:
            "Generation could not finish. Automatic retries may follow; you can request another copy after they finish.",
        },
      });
  });
}
export async function publishAccountExport(job: ExportJob, fileId: string) {
  return prisma.$transaction(async (tx) => {
    const data = await currentExportInTx(tx, job);
    if (
      !data ||
      data.status !== "GENERATING" ||
      data.generationLeaseToken !== job.leaseToken
    )
      return false;
    const expiresAt = new Date(Date.now() + DAY);
    const file = await tx.evidenceFile.updateMany({
      where: {
        id: fileId,
        userId: data.userId,
        kind: "ACCOUNT_EXPORT",
        storageState: "UPLOADING",
        deletedAt: null,
      },
      data: { storageState: "READY", expiresAt, isTemporary: true },
    });
    if (file.count !== 1)
      throw new AppError({
        code: "STORAGE_FAILED",
        message: "The generated export is no longer available.",
      });
    await tx.accountExport.update({
      where: { id: data.id },
      data: {
        status: "READY",
        generationLeaseToken: null,
        evidenceFileId: fileId,
        expiresAt,
        generatedAt: new Date(),
        error: null,
      },
    });
    await createNotificationInTx(tx, {
      userId: data.userId,
      type: "ACCOUNT_EXPORT_READY",
      title: "Your account export is ready",
      body: "Your private download is available for 24 hours in Privacy settings.",
      actionUrl: "/settings/privacy/exports",
      dedupeKey: `export-ready:${data.id}`,
    });
    return true;
  });
}
export async function abandonUnpublishedExportFile(fileId: string) {
  return prisma.$transaction(async (tx) => {
    const ref = await tx.evidenceFile.findUnique({
      where: { id: fileId },
      select: { userId: true },
    });
    if (!ref) return null;
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ref.userId} FOR UPDATE`;
    if (
      await tx.accountExport.findFirst({
        where: { evidenceFileId: fileId, deletedAt: null },
        select: { id: true },
      })
    )
      return null;
    if (
      !(await tx.evidenceFile.findFirst({
        where: { id: fileId, storageState: { not: "PURGED" } },
        select: { id: true },
      }))
    )
      return null;
    return tx.evidenceFile.update({
      where: { id: fileId },
      data: {
        storageState: "PURGE_PENDING",
        purgeRequestedAt: new Date(),
        deletedAt: new Date(),
      },
    });
  });
}
