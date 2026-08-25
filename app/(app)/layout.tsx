/**
 * Authenticated workspace layout.
 *
 * Real authorization happens in each page and server action. The redirect here
 * is only so that a signed-out visitor does not see an empty shell.
 */
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { APP_NAV_ITEMS } from "@/components/layout/navigation";
import { requireActorOrRedirect, getSessionUser } from "@/lib/auth";
import { listProfilesForActor } from "@/lib/db/repositories/profiles";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/profiles/active";

import { setActiveProfile } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActorOrRedirect();
  const user = await getSessionUser();
  if (!user) {
    return null;
  }

  const profiles = await listProfilesForActor(actor);
  const jar = await cookies();
  const cookieId = jar.get(ACTIVE_PROFILE_COOKIE)?.value;
  const active =
    profiles.find((profile) => profile.id === cookieId)?.id ??
    profiles.find((profile) => profile.isPrimary)?.id ??
    profiles[0]?.id ??
    null;

  return (
    <AppShell
      user={{
        displayName: user.name ?? user.email,
        email: user.email,
        role: user.role,
      }}
      profiles={profiles.map((profile) => ({
        id: profile.id,
        displayName: profile.displayName,
        kind: profile.kind,
        consentStatus: profile.consentStatus,
      }))}
      activeProfileId={active}
      navItems={APP_NAV_ITEMS}
      onProfileChange={setActiveProfile}
    >
      {children}
    </AppShell>
  );
}
