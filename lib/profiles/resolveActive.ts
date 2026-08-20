import { cookies } from "next/headers";

import { listProfilesForActor } from "@/lib/db/repositories/profiles";
import type { ActorContext } from "@/lib/permissions/actor";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/profiles/active";

export async function resolveActiveProfile(actor: ActorContext) {
  const profiles = await listProfilesForActor(actor);
  const jar = await cookies();
  const cookieId = jar.get(ACTIVE_PROFILE_COOKIE)?.value;
  const active =
    profiles.find((profile) => profile.id === cookieId) ??
    profiles.find((profile) => profile.isPrimary) ??
    profiles[0] ??
    null;
  return { profiles, active };
}
