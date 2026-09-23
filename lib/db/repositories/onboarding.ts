import { AppError, NotFoundError } from "@/lib/core/errors";
import { prisma } from "@/lib/db/client";
import type { ActorContext } from "@/lib/permissions/actor";
import { requirePermission } from "@/lib/permissions/policy";
import {
  encryptedIdentifierFields,
  encryptedProfileFields,
  identifierBlindIndex,
} from "@/lib/profiles/fields";
import type { IdentifierInput, ProfileInput } from "@/lib/profiles/validation";
import { lockActiveAccount } from "./access";
import { appendConsentRecordInTx } from "./consent";
import { createSelfProfileInTx } from "./profiles";
import { createIdentifierInTx, syncPrimaryIdentifiersInTx } from "./profileIdentifiers";

export const SELF_PROFILE_STATEMENT =
  "I confirm that this profile is about me, that I live in the country and state I selected, and that I understand Brokermogger is not a law firm and does not guarantee removal.";

export async function saveOnboardingRecord(
  actor: ActorContext,
  input: {
    profileId: string | null;
    profile: ProfileInput;
    identifiers: IdentifierInput[];
    complete: boolean;
  }
) {
  requirePermission(actor, "profile:create", { ownerUserId: actor.userId });
  return prisma.$transaction(
    async (tx) => {
      await lockActiveAccount(tx, actor.userId);
      const existing = await tx.userProfile.findFirst({
        where: {
          ownerUserId: actor.userId,
          kind: "SELF",
          deletedAt: null,
          ...(input.profileId ? { id: input.profileId } : {}),
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      });
      if (input.profileId && !existing) throw new NotFoundError();
      if (existing?.onboardingCompletedAt)
        return { profileId: existing.id, completed: true };
      const profile = existing
        ? await tx.userProfile.update({
            where: { id: existing.id },
            data: {
              ...encryptedProfileFields(existing.id, input.profile),
              updatedById: actor.userId,
            },
          })
        : await createSelfProfileInTx(tx, actor, input.profile);
      await syncPrimaryIdentifiersInTx(tx, actor, profile.id, input.profile);
      for (const item of input.identifiers) {
        const duplicate = await tx.profileIdentifier.findUnique({
          where: {
            profileId_type_valueBi: {
              profileId: profile.id,
              type: item.type,
              valueBi: identifierBlindIndex(item),
            },
          },
        });
        if (duplicate) {
          if (duplicate.deletedAt)
            await tx.profileIdentifier.update({
              where: { id: duplicate.id },
              data: { ...encryptedIdentifierFields(duplicate.id, item), deletedAt: null },
            });
        } else await createIdentifierInTx(tx, actor, profile.id, item);
      }
      if (input.complete) {
        const identifiers = await tx.profileIdentifier.count({
          where: { profileId: profile.id, deletedAt: null },
        });
        if (identifiers < 2)
          throw new AppError({
            code: "CONFLICT",
            message: "Profile identifiers are incomplete. Review and save again.",
          });
        await appendConsentRecordInTx(tx, {
          profileId: profile.id,
          actorUserId: actor.userId,
          purpose: "PROFILE_MANAGEMENT",
          method: "SELF_ATTESTATION",
          status: "SELF",
          statementText: SELF_PROFILE_STATEMENT,
        });
        await tx.userProfile.update({
          where: { id: profile.id },
          data: { onboardingCompletedAt: new Date() },
        });
      }
      return { profileId: profile.id, completed: input.complete };
    },
    { timeout: 15_000 }
  );
}

export async function getResumableOnboarding(actor: ActorContext) {
  requirePermission(actor, "profile:read", { ownerUserId: actor.userId });
  return prisma.userProfile.findFirst({
    where: { ownerUserId: actor.userId, kind: "SELF", deletedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
}
