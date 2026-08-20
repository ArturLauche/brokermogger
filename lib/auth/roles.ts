/**
 * Role comparison.
 *
 * Kept separate from `guards.ts` so that the rule can be unit tested without
 * pulling the Auth.js runtime (and with it `next/server`) into a plain Node
 * test process.
 *
 * This is a coarse "does the role reach this area" check for route guards. Fine
 * grained decisions stay in `lib/permissions/policy.ts`.
 */
import type { UserRole } from "@prisma/client";

/** INSTANCE_ADMIN satisfies MAINTAINER, and both satisfy USER. */
export function roleSatisfies(required: UserRole, actual: UserRole): boolean {
  switch (required) {
    case "USER":
      return true;
    case "MAINTAINER":
      return actual === "MAINTAINER" || actual === "INSTANCE_ADMIN";
    case "INSTANCE_ADMIN":
      return actual === "INSTANCE_ADMIN";
    default:
      return false;
  }
}
