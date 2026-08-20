/**
 * Module augmentation for Auth.js.
 *
 * Brokermogger stores `role` and `status` on the user row and needs both in the
 * session so that server components can render the right navigation without a
 * second query. Authorization itself always goes through
 * `lib/permissions/policy.ts`, never through these fields directly.
 */
import type { UserRole, UserStatus } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role: UserRole;
    status: UserStatus;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: UserRole;
      status: UserStatus;
    };
    expires: string;
  }
}

declare module "@auth/core/adapters" {
  interface AdapterUser {
    role: UserRole;
    status: UserStatus;
  }
}
