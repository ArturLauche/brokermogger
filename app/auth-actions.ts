"use server";

import { cookies } from "next/headers";

import { nextAuth } from "@/lib/auth/config";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/profiles/active";

export async function signOutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACTIVE_PROFILE_COOKIE);
  await nextAuth.signOut({ redirectTo: "/login" });
}
