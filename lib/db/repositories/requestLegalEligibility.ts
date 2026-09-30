import type { RequestType, RequestChannel } from "@prisma/client";
import { legalRuleAllowsChannel } from "@/lib/jurisdiction/channels";

import { AppError } from "@/lib/core/errors";
import type { PrismaTransaction } from "@/lib/db/client";

/**
 * Approval and dispatch deliberately bypass the catalogue TTL. Published history
 * remains readable, but a withdrawn, expired or replaced basis needs fresh review.
 * Call after the ownership/account/request gates, in their transaction.
 */
export async function assertCurrentLegalBasisInTx(
  tx: PrismaTransaction,
  request: {
    jurisdictionId: string;
    legalRuleVersionId: string | null;
    requestType: RequestType;
    channel: RequestChannel;
  }
): Promise<{ legalBasisText: string; deadlineDays: number | null }> {
  const unavailable = () =>
    new AppError({
      code: "LEGAL_RULE_UNAVAILABLE",
      message:
        "This legal basis is no longer available for approval or sending. Prepare and review a fresh draft using the current rules.",
    });
  if (!request.legalRuleVersionId) throw unavailable();
  const reference = await tx.legalRuleVersion.findUnique({
    where: { id: request.legalRuleVersionId },
    select: { legalRuleId: true },
  });
  if (!reference) throw unavailable();

  // Publication/deactivation take the parent row's write lock. Do not race them
  // while checking the currently applicable version and reserving a dispatch.
  await tx.$executeRaw`SELECT 1 FROM "Jurisdiction" WHERE id = ${request.jurisdictionId} FOR SHARE`;
  await tx.$executeRaw`SELECT 1 FROM "LegalRule" WHERE id = ${reference.legalRuleId} FOR SHARE`;
  const now = new Date();
  const current = await tx.legalRuleVersion.findFirst({
    where: {
      legalRuleId: reference.legalRuleId,
      status: { in: ["PUBLISHED", "SUPERSEDED", "ARCHIVED"] },
      effectiveFrom: { lte: now },
      legalRule: {
        jurisdictionId: request.jurisdictionId,
        isActive: true,
        deletedAt: null,
        jurisdiction: { isActive: true },
      },
    },
    orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
    select: {
      id: true,
      status: true,
      effectiveUntil: true,
      supportedRequestTypes: true,
      verificationRequirements: true,
      legalBasisText: true,
      deadlineDays: true,
    },
  });
  // Include withdrawn versions when picking the latest: their predecessors must
  // not silently become eligible again. A future replacement stays inactive.
  if (
    !current ||
    current.id !== request.legalRuleVersionId ||
    current.status !== "PUBLISHED" ||
    (current.effectiveUntil && current.effectiveUntil <= now) ||
    !current.supportedRequestTypes.includes(request.requestType) ||
    !legalRuleAllowsChannel(current.verificationRequirements, request.channel)
  )
    throw unavailable();
  return { legalBasisText: current.legalBasisText, deadlineDays: current.deadlineDays };
}
