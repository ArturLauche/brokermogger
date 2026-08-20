/**
 * Persistence for the append-only, hash chained `AuditLog` table.
 *
 * This repository is infrastructure, not user data: audit rows are written on
 * behalf of an actor but are never owned by one, so there is no ownership
 * scoping here. Reading audit data for the admin console goes through
 * `admin:audit:read` in the calling service. The hash itself is computed by
 * `lib/audit/service.ts`; this module only guarantees that the chain is
 * serialised (advisory lock) and that the previous row is read inside the same
 * transaction as the insert.
 */
import {
  type ActorType,
  type AuditOutcome,
  type Prisma,
  type UserRole,
} from "@prisma/client";

import { prisma } from "@/lib/db/client";

/** Advisory lock key shared by every writer of the audit chain. */
const CHAIN_LOCK_NAME = "brokermogger_audit_chain";

export interface AuditLogInsert {
  actorType: ActorType;
  actorUserId: string | null;
  actorRole: UserRole | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  targetUserId: string | null;
  outcome: AuditOutcome;
  reason: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
  requestId: string | null;
  metadata: Record<string, unknown>;
  /** Set by the caller so that the stored row and the hashed payload agree. */
  createdAt: Date;
}

export interface AppendedAuditLog {
  id: string;
  sequence: bigint;
  prevHash: string | null;
  hash: string;
  createdAt: Date;
}

/** Row shape needed to recompute the chain. */
export interface AuditChainRow {
  id: string;
  sequence: bigint;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  targetUserId: string | null;
  outcome: AuditOutcome;
  metadata: Prisma.JsonValue;
  prevHash: string | null;
  hash: string;
  createdAt: Date;
}

const CHAIN_SELECT = {
  id: true,
  sequence: true,
  actorUserId: true,
  action: true,
  resourceType: true,
  resourceId: true,
  targetUserId: true,
  outcome: true,
  metadata: true,
  prevHash: true,
  hash: true,
  createdAt: true,
} as const;

/**
 * Appends one row to the audit chain.
 *
 * The transaction takes a session-independent advisory lock so that two
 * concurrent writers cannot read the same predecessor and produce a fork.
 * `computeHash` receives the previous hash and returns the hash of the new row.
 */
export async function appendAuditLog(
  input: AuditLogInsert,
  computeHash: (previousHash: string | null) => string
): Promise<AppendedAuditLog> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      CHAIN_LOCK_NAME
    );

    const previous = await tx.auditLog.findFirst({
      orderBy: { sequence: "desc" },
      select: { hash: true },
    });

    const prevHash = previous?.hash ?? null;
    const hash = computeHash(prevHash);

    const created = await tx.auditLog.create({
      data: {
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        targetUserId: input.targetUserId,
        outcome: input.outcome,
        reason: input.reason,
        ipHash: input.ipHash,
        userAgentHash: input.userAgentHash,
        requestId: input.requestId,
        metadata: input.metadata as Prisma.InputJsonObject,
        prevHash,
        hash,
        createdAt: input.createdAt,
      },
      select: {
        id: true,
        sequence: true,
        prevHash: true,
        hash: true,
        createdAt: true,
      },
    });

    return created;
  });
}

export interface AuditChainWindow {
  /** Ascending by sequence, so the chain can be recomputed forward. */
  rows: AuditChainRow[];
  /**
   * Hash of the row immediately before the window, or null when the window
   * starts at the genesis row. Verification anchors on this value.
   */
  previousHash: string | null;
}

/**
 * Returns the newest `limit` rows in ascending order together with the hash of
 * the row that precedes them. Without a limit the whole chain is returned.
 */
export async function listAuditChainWindow(limit?: number): Promise<AuditChainWindow> {
  if (limit === undefined) {
    const rows = await prisma.auditLog.findMany({
      orderBy: { sequence: "asc" },
      select: CHAIN_SELECT,
    });
    return { rows, previousHash: null };
  }

  const newestFirst = await prisma.auditLog.findMany({
    orderBy: { sequence: "desc" },
    select: CHAIN_SELECT,
    take: limit,
  });

  const rows = newestFirst.reverse();
  const first = rows[0];
  if (!first) {
    return { rows, previousHash: null };
  }

  const predecessor = await prisma.auditLog.findFirst({
    where: { sequence: { lt: first.sequence } },
    orderBy: { sequence: "desc" },
    select: { hash: true },
  });

  return { rows, previousHash: predecessor?.hash ?? null };
}

export async function countAuditLogs(): Promise<number> {
  return prisma.auditLog.count();
}
