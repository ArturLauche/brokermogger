"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireActor } from "@/lib/auth";
import { getOwnedProfile } from "@/lib/db/repositories/profiles";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/profiles/active";
import { entityIdSchema } from "@/lib/validation/ids";
import { parseWithSchema } from "@/lib/validation/form";

export async function setActiveProfile(profileId: string): Promise<void> {
  const actor = await requireActor();
  const id = parseWithSchema(entityIdSchema, profileId);
  await getOwnedProfile(actor, id);
  const jar = await cookies();
  jar.set(ACTIVE_PROFILE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}
