/** Shared transactional gates for approval, editing and dispatch. */
export { assertCurrentProfileConsent } from "@/lib/consent/current";
import { AppError, NotFoundError } from "@/lib/core/errors";
import type { PrismaTransaction } from "@/lib/db/client";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";

type RequestDecisionAction =
  "request:approve" | "request:send" | "request:update" | "request:recordOutcome";

/** Authorize and fence lifecycle reads without loading message or profile payloads. */
export async function lockRequestForDecision(
  tx: PrismaTransaction,
  actor: ActorContext,
  id: string,
  action: RequestDecisionAction
) {
  const ref = await tx.removalRequest.findFirst({
    where: { id, deletedAt: null },
    select: { userId: true, profileId: true, brokerId: true },
  });
  if (!ref) throw new NotFoundError();
  requirePermission(actor, action, { ownerUserId: ref.userId });
  // Account -> profile -> request is also the lock order used by deletion/revocation.
  await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ref.userId} FOR UPDATE`;
  const active = await tx.user.findFirst({
    where: {
      id: ref.userId,
      status: "ACTIVE",
      deletionRequestedAt: null,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!active)
    throw new AppError({ code: "FORBIDDEN", message: "This account is not active." });
  await tx.$executeRaw`SELECT 1 FROM "UserProfile" WHERE id = ${ref.profileId} FOR UPDATE`;
  await tx.$executeRaw`SELECT 1 FROM "RemovalRequest" WHERE id = ${id} FOR UPDATE`;
  await tx.$executeRaw`SELECT 1 FROM "Broker" WHERE id = ${ref.brokerId} FOR SHARE`;
  return ref;
}

export async function loadRequestForDecision(
  tx: PrismaTransaction,
  actor: ActorContext,
  id: string,
  action: RequestDecisionAction
) {
  const ref = await lockRequestForDecision(tx, actor, id, action);
  const request = await tx.removalRequest.findFirst({
    where: {
      id,
      userId: ref.userId,
      deletedAt: null,
      profile: { deletedAt: null, ownerUserId: ref.userId },
    },
    include: {
      user: { select: { timezone: true } },
      templateVersion: { select: { template: { select: { requestType: true } } } },
      profile: {
        select: {
          id: true,
          kind: true,
          consentStatus: true,
          onboardingCompletedAt: true,
          legalNameBi: true,
          contactEmailBi: true,
          countryCode: true,
          region: true,
          residencyConfirmed: true,
          householdMember: {
            select: {
              revokedAt: true,
              consents: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  status: true,
                  verifiedAt: true,
                  revokedAt: true,
                  scope: true,
                },
              },
            },
          },
        },
      },
      broker: { include: { contactMethods: true, jurisdictionCoverage: true } },
    },
  });
  if (!request) throw new NotFoundError();
  return request;
}
