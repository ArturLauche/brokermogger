/**
 * Auth.js database adapter wiring.
 *
 * The adapter needs the raw Prisma client, which may only be imported inside
 * `lib/db/**`. Keeping the wiring here means `lib/auth/config.ts` stays free of
 * direct database access and the ESLint boundary holds.
 *
 * Auth.js owns the `User`, `Account`, `Session` and `VerificationToken` tables.
 * Everything Brokermogger adds on top (role, status, quota, audit entries) is
 * applied in the Auth.js callbacks and events, not inside the adapter.
 */
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "@auth/core/adapters";

import { prisma } from "@/lib/db/client";

export function createAuthAdapter(): Adapter {
  return PrismaAdapter(prisma);
}
