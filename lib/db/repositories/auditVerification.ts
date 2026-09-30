import { Prisma } from "@prisma/client";
import { AuditChainVerifier } from "@/lib/audit/hash";
import { prisma } from "@/lib/db/client";
import type { ClaimedJob } from "@/lib/jobs/types";
import { parseJobPayload } from "@/lib/jobs/payloads";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import { CHAIN_SELECT } from "./audit";
import { lockAuthorizedAccount } from "./access";
import { hasCurrentLease } from "./jobs";
import { lockJobLeaseInTx } from "./jobLease";

export const AUDIT_VERIFICATION_PAGE_SIZE = 250;
export const AUDIT_VERIFICATION_KEY = "recurring:VERIFY_AUDIT_CHAIN";
type VerificationJob = ClaimedJob<"VERIFY_AUDIT_CHAIN">;

/** One stable MVCC snapshot allows appends and retention to continue without a global writer lock. */
export async function scanAuditChain(job: VerificationJob) {
  parseJobPayload("VERIFY_AUDIT_CHAIN", job.payload);
  if (!(await hasCurrentLease(job))) return null;
  const startedAt = new Date();
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const head = await tx.auditLog.findFirst({
        orderBy: { sequence: "desc" },
        select: { sequence: true, hash: true },
      });
      let rows = await tx.auditLog.findMany({
        orderBy: { sequence: "asc" },
        select: CHAIN_SELECT,
        take: AUDIT_VERIFICATION_PAGE_SIZE,
      });
      const firstSequence = rows[0]?.sequence ?? null;
      const anchor = rows[0]?.prevHash ?? null;
      // A missing predecessor is an explicitly retained-prefix boundary, never an internal gap.
      const predecessorStillPresent = anchor
        ? await tx.auditLog.findFirst({
            where: { hash: anchor },
            select: { id: true },
          })
        : null;
      const verifier = new AuditChainVerifier(predecessorStillPresent ? null : anchor);
      for (;;) {
        // Read the current lease outside the fixed snapshot so cancellation and renewal stay visible.
        if (!(await hasCurrentLease(job))) return null;
        if (!verifier.consume(rows) || rows.length < AUDIT_VERIFICATION_PAGE_SIZE) break;
        rows = await tx.auditLog.findMany({
          where: { sequence: { gt: rows.at(-1)!.sequence } },
          orderBy: { sequence: "asc" },
          select: CHAIN_SELECT,
          take: AUDIT_VERIFICATION_PAGE_SIZE,
        });
      }
      return {
        startedAt,
        firstSequence,
        lastSequence: head?.sequence ?? null,
        lastHash: head?.hash ?? null,
        anchorHash: verifier.anchorHash,
        checkedCount: verifier.checkedCount,
        isValid: verifier.problemKind === null,
        problemSequence: verifier.problemSequence,
        problemKind: verifier.problemKind,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 120_000,
      maxWait: 5000,
    }
  );
}

/** A cancelled or superseded attempt cannot publish a reassuring stale result. */
export async function publishAuditVerification(
  job: VerificationJob,
  result: NonNullable<Awaited<ReturnType<typeof scanAuditChain>>>
) {
  return prisma.$transaction(async (tx) => {
    if (!(await lockJobLeaseInTx(tx, job, "VERIFY_AUDIT_CHAIN", {}))) return false;
    await tx.auditChainVerification.create({ data: { ...result, jobId: job.id } });
    return true;
  });
}

/** A read uses only the last complete result and queue state, never AuditLog payloads. */
export async function getAuditVerificationStatus(actor: ActorContext) {
  requirePermission(actor, "admin:audit:read");
  const [last, job] = await Promise.all([
    prisma.auditChainVerification.findFirst({
      orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    }),
    prisma.backgroundJob.findUnique({
      where: { idempotencyKey: AUDIT_VERIFICATION_KEY },
      select: { id: true, status: true, runAt: true, lastError: true },
    }),
  ]);
  return { last, job };
}

export async function requestAuditVerification(actor: ActorContext, raw: unknown = {}) {
  parseJobPayload("VERIFY_AUDIT_CHAIN", raw);
  requirePermission(actor, "admin:audit:read");
  return prisma.$transaction(async (tx) => {
    await lockAuthorizedAccount(tx, actor, "admin:audit:read");
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      AUDIT_VERIFICATION_KEY
    );
    const existing = await tx.backgroundJob.findUnique({
      where: { idempotencyKey: AUDIT_VERIFICATION_KEY },
    });
    if (existing?.status === "RUNNING")
      return { id: existing.id, status: existing.status };
    // Repeated clicks reuse a pending pass, including requests from another operator.
    if (
      existing &&
      ["PENDING", "RETRYABLE"].includes(existing.status) &&
      existing.attemptCount < existing.maxAttempts &&
      existing.runAt <= new Date()
    )
      return { id: existing.id, status: existing.status };
    const data = {
      type: "VERIFY_AUDIT_CHAIN" as const,
      payloadJson: {},
      status: "PENDING" as const,
      runAt: new Date(),
      attemptCount: 0,
      maxAttempts: 5,
      priority: 90,
      lastError: null,
      completedAt: null,
      cancelledAt: null,
      lockedAt: null,
      lockedBy: null,
      lockExpiresAt: null,
      leaseToken: null,
    };
    return existing
      ? tx.backgroundJob.update({
          where: { id: existing.id },
          data,
          select: { id: true, status: true },
        })
      : tx.backgroundJob.create({
          data: { ...data, idempotencyKey: AUDIT_VERIFICATION_KEY },
          select: { id: true, status: true },
        });
  });
}
