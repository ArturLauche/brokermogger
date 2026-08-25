import { cookies } from "next/headers";

import type { ActorContext } from "@/lib/permissions/actor";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/profiles/active";
import { resolveActiveProfile } from "@/lib/profiles/resolveActive";

/**
 * App-layer adapter: reads the active-profile cookie and resolves it through
 * domain logic. Kept out of `lib/**` so that domain code does not import Next.js.
 */
export async function resolveActiveProfileForRequest(actor: ActorContext) {
  const jar = await cookies();
  return resolveActiveProfile(actor, jar.get(ACTIVE_PROFILE_COOKIE)?.value ?? null);
}
