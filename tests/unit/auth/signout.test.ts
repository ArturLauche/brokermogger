import { expect, it, vi } from "vitest";

const { signOut, deleteCookie } = vi.hoisted(() => ({
  signOut: vi.fn(),
  deleteCookie: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ nextAuth: { signOut } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: deleteCookie }) }));

import { signOutAction } from "@/app/auth-actions";
import { ACTIVE_PROFILE_COOKIE } from "@/lib/profiles/active";

it("revokes the session using the supported Auth.js action and clears profile selection", async () => {
  await signOutAction();
  expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  expect(deleteCookie).toHaveBeenCalledWith(ACTIVE_PROFILE_COOKIE);
});
