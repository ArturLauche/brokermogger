"use server";

import { redirect } from "next/navigation";

import { exportAccountData, requestAccountDeletion } from "@/lib/account/service";
import { requireActor } from "@/lib/auth";
import {
  addIdentifier,
  softDeleteIdentifier,
  softDeleteProfile,
  revealOwnedIdentifier,
} from "@/lib/db/repositories/profiles";
import type { IdentifierType } from "@prisma/client";

export async function revealIdentifierAction(identifierId: string): Promise<string> {
  const actor = await requireActor();
  const revealed = await revealOwnedIdentifier(actor, identifierId);
  return revealed.value;
}

export async function addIdentifierAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const profileId = String(formData.get("profileId") ?? "");
  const type = String(formData.get("type") ?? "OTHER") as IdentifierType;
  const value = String(formData.get("value") ?? "").trim();
  if (!profileId || !value) {
    redirect("/vault?error=validation");
  }
  await addIdentifier(actor, profileId, { type, value });
  redirect("/vault");
}

export async function deleteIdentifierAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await softDeleteIdentifier(actor, String(formData.get("identifierId") ?? ""));
  redirect("/vault");
}

export async function deleteProfileAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  await softDeleteProfile(actor, String(formData.get("profileId") ?? ""));
  redirect("/dashboard");
}

export async function deleteAccountFromVaultAction(): Promise<void> {
  const actor = await requireActor();
  await requestAccountDeletion(actor);
  redirect("/");
}

export async function downloadVaultExport(): Promise<void> {
  redirect("/settings/privacy");
}

export { exportAccountData };
