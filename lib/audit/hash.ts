import type { AuditOutcome } from "@prisma/client";
import { canonicalJson, chainHash } from "@/lib/security/crypto";

export interface AuditHashFields {
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  targetUserId: string | null;
  outcome: AuditOutcome;
  createdAt: Date;
  metadata: unknown;
}

/** Keep the historical hash format unchanged across storage and verifier upgrades. */
export function auditCanonicalPayload(fields: AuditHashFields): string {
  return canonicalJson({
    action: fields.action,
    resourceType: fields.resourceType,
    resourceId: fields.resourceId,
    actorUserId: fields.actorUserId,
    targetUserId: fields.targetUserId,
    outcome: fields.outcome,
    createdAt: fields.createdAt,
    metadata: fields.metadata,
  });
}

export interface VerifiableAuditRow extends AuditHashFields {
  sequence: bigint;
  prevHash: string | null;
  hash: string;
}

/** Constant-sized state; database pages and historical metadata are never retained. */
export class AuditChainVerifier {
  checkedCount = 0;
  problemSequence: bigint | null = null;
  problemKind: "hash_mismatch" | "broken_link" | null = null;
  private previousHash: string | null;

  constructor(readonly anchorHash: string | null) {
    this.previousHash = anchorHash;
  }

  consume(rows: readonly VerifiableAuditRow[]): boolean {
    if (this.problemKind) return false;
    for (const row of rows) {
      this.checkedCount += 1;
      if (row.prevHash !== this.previousHash) {
        this.problemSequence = row.sequence;
        this.problemKind = "broken_link";
        return false;
      }
      if (chainHash(this.previousHash, auditCanonicalPayload(row)) !== row.hash) {
        this.problemSequence = row.sequence;
        this.problemKind = "hash_mismatch";
        return false;
      }
      this.previousHash = row.hash;
    }
    return true;
  }
}
