import { randomUUID } from "node:crypto";
import type { PrismaTransaction } from "@/lib/db/client";
import type { ActorContext } from "@/lib/permissions/actor";
import { encryptedIdentifierFields, identifierBlindIndex } from "@/lib/profiles/fields";
import type { IdentifierInput, ProfileInput } from "@/lib/profiles/validation";

/** Caller holds the active account lock and has checked profile ownership. */
export async function createIdentifierInTx(
  tx: PrismaTransaction,
  actor: ActorContext,
  profileId: string,
  input: IdentifierInput
) {
  const id = randomUUID();
  return tx.profileIdentifier.create({
    data: {
      id,
      profileId,
      ...encryptedIdentifierFields(id, input),
      createdById: actor.userId,
    },
  });
}

export async function syncPrimaryIdentifiersInTx(
  tx: PrismaTransaction,
  actor: ActorContext,
  profileId: string,
  profile: ProfileInput
) {
  for (const input of [
    { type: "FULL_NAME" as const, value: profile.legalName, isPrimary: true },
    { type: "EMAIL" as const, value: profile.contactEmail, isPrimary: true },
  ]) {
    const duplicate = await tx.profileIdentifier.findUnique({
      where: {
        profileId_type_valueBi: {
          profileId,
          type: input.type,
          valueBi: identifierBlindIndex(input),
        },
      },
    });
    const previous = await tx.profileIdentifier.findFirst({
      where: { profileId, type: input.type, isPrimary: true, deletedAt: null },
    });
    const target = duplicate ?? previous;
    await tx.profileIdentifier.updateMany({
      where: {
        profileId,
        type: input.type,
        isPrimary: true,
        ...(target ? { id: { not: target.id } } : {}),
      },
      data: { isPrimary: false },
    });
    if (target)
      await tx.profileIdentifier.update({
        where: { id: target.id },
        data: {
          ...encryptedIdentifierFields(target.id, input),
          deletedAt: null,
          updatedById: actor.userId,
        },
      });
    else await createIdentifierInTx(tx, actor, profileId, input);
  }
}
