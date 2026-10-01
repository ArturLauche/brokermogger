/**
 * Append-only consent records.
 */
import type {
  ConsentMethod,
  ConsentPurpose,
  ConsentStatus,
  Prisma,
} from "@prisma/client";

import { prisma, type PrismaTransaction } from "@/lib/db/client";
import { canonicalJson, chainHash, sha256Hex } from "@/lib/security/crypto";

export interface ConsentRecordInput {
  profileId: string;
  actorUserId: string;
  purpose: ConsentPurpose;
  method: ConsentMethod;
  status: ConsentStatus;
  statementText: string;
  householdConsentId?: string;
  removalRequestId?: string;
  evidence?: Record<string, unknown>;
}

export async function appendConsentRecord(input: ConsentRecordInput) {
  return prisma.$transaction((tx) => appendConsentRecordInTx(tx, input));
}

export async function appendConsentRecordInTx(
  tx: PrismaTransaction,
  input: ConsentRecordInput
) {
  await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${input.actorUserId} FOR UPDATE`;
  await tx.$executeRaw`SELECT 1 FROM "UserProfile" WHERE id = ${input.profileId} FOR UPDATE`;
  await tx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext($1))`,
    `brokermogger_consent_${input.profileId}`
  );
  const previous = await tx.consentRecord.findFirst({
    where: { profileId: input.profileId },
    orderBy: { createdAt: "desc" },
    select: { hash: true, createdAt: true },
  });
  const createdAt = new Date(
    Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1)
  );
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
      createdAt,
    },
  });
}
