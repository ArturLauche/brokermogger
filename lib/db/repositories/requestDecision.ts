/** Shared transactional gates for approval, editing and dispatch. */
export { assertCurrentProfileConsent } from "@/lib/consent/current";
import { AppError, NotFoundError } from "@/lib/core/errors";
import type { PrismaTransaction } from "@/lib/db/client";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";

export async function loadRequestForDecision(
  tx: PrismaTransaction,
  actor: ActorContext,
  id: string,
  action: "request:approve" | "request:send" | "request:update" | "request:recordOutcome"
) {
  const ref = await tx.removalRequest.findFirst({
    where: { id, deletedAt: null },
    select: { userId: true, profileId: true },
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
  const request = await tx.removalRequest.findFirst({
    where: { id, deletedAt: null, profile: { deletedAt: null, ownerUserId: ref.userId } },
    include: {
      user: { select: { timezone: true } },
      profile: {
        select: {
          id: true,
          kind: true,
          consentStatus: true,
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
