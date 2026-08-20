"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireActor } from "@/lib/auth";
import { getOwnedProfile } from "@/lib/db/repositories/profiles";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/profiles/active";

export async function setActiveProfile(profileId: string): Promise<void> {
  const actor = await requireActor();
  await getOwnedProfile(actor, profileId);
  const jar = await cookies();
  jar.set(ACTIVE_PROFILE_COOKIE, profileId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
