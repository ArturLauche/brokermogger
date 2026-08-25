import { listProfilesForActor } from "@/lib/db/repositories/profiles";
import type { ActorContext } from "@/lib/permissions/actor";

export interface ActiveProfileCandidate {
  id: string;
  isPrimary: boolean;
}

/**
 * Picks the profile the UI should treat as active.
 *
 * Cookie selection is a hint only. Authorization still uses `ActorContext`;
 * this helper never reads cookies or Next.js APIs so it stays unit-testable.
 */
export function pickActiveProfile<T extends ActiveProfileCandidate>(
  profiles: T[],
  cookieId?: string | null
): T | null {
  return (
    profiles.find((profile) => profile.id === cookieId) ??
    profiles.find((profile) => profile.isPrimary) ??
    profiles[0] ??
    null
  );
}

export async function resolveActiveProfile(
  actor: ActorContext,
  cookieId?: string | null
) {
  const profiles = await listProfilesForActor(actor);
  const active = pickActiveProfile(profiles, cookieId);
  return { profiles, active };
}
