/**
 * Append-only consent records.
 */
import type {
  ConsentMethod,
  ConsentPurpose,
  ConsentStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { canonicalJson, chainHash, sha256Hex } from "@/lib/security/crypto";

export async function appendConsentRecord(input: {
  profileId: string;
  actorUserId: string;
  purpose: ConsentPurpose;
  method: ConsentMethod;
  status: ConsentStatus;
  statementText: string;
  householdConsentId?: string;
  removalRequestId?: string;
  evidence?: Record<string, unknown>;
}) {
  const createdAt = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      `brokermogger_consent_${input.profileId}`
    );
    const previous = await tx.consentRecord.findFirst({
      where: { profileId: input.profileId },
      orderBy: { createdAt: "desc" },
      select: { hash: true },
    });
    const hash = chainHash(
      previous?.hash ?? null,
      canonicalJson({
        profileId: input.profileId,
        purpose: input.purpose,
        statement: input.statementText,
        createdAt,
      })
    );
    return tx.consentRecord.create({
      data: {
        profileId: input.profileId,
        actorUserId: input.actorUserId,
        purpose: input.purpose,
        method: input.method,
        status: input.status,
        statementText: input.statementText,
        statementHash: sha256Hex(input.statementText),
        ...(input.householdConsentId
          ? { householdConsentId: input.householdConsentId }
          : {}),
        ...(input.removalRequestId ? { removalRequestId: input.removalRequestId } : {}),
        evidence: (input.evidence ?? {}) as Prisma.InputJsonValue,
        hash,
        prevHash: previous?.hash ?? null,
        grantedAt: createdAt,
      },
    });
  });
}
