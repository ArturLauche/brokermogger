/**
 * Account level reads and writes used by the authentication layer.
 *
 * These functions run in contexts where no `ActorContext` exists yet: the
 * Auth.js callbacks decide whether a session may be created at all. They are
 * therefore deliberately narrow. Anything that reads or changes user owned data
 * after sign in belongs in an ownership scoped repository instead.
 */
import type { UserRole, UserStatus } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import {
  accountEmailIndex,
  encryptedAccountEmail,
  readAccountEmail,
} from "@/lib/security/accountEmail";

export interface AccountSummary {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerified: Date | null;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
  deletionRequestedAt: Date | null;
}

const ACCOUNT_SELECT = {
  id: true,
  email: true,
  emailEnc: true,
  name: true,
  role: true,
  status: true,
  emailVerified: true,
  lastLoginAt: true,
  deletedAt: true,
  deletionRequestedAt: true,
} as const;

export async function findAccountById(userId: string): Promise<AccountSummary | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: ACCOUNT_SELECT,
  });
  return user ? readAccountEmail(user) : null;
}

export async function findAccountByEmail(email: string): Promise<AccountSummary | null> {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { emailBi: accountEmailIndex(email) },
        {
          emailEnc: null,
          email: { equals: email.trim().toLowerCase(), mode: "insensitive" },
        },
      ],
    },
    select: ACCOUNT_SELECT,
  });
  return user ? readAccountEmail(user) : null;
}

/**
 * Applies the Brokermogger defaults to a freshly created Auth.js user:
 * the address is normalised to lowercase, an operator listed in
 * `INSTANCE_ADMIN_EMAILS` is promoted, and the fair use quota row is created.
 * Returns the effective values so the caller can audit them.
 */
export async function initialiseNewAccount(input: {
  userId: string;
  email: string;
  promoteToInstanceAdmin: boolean;
}): Promise<AccountSummary> {
  const email = input.email.trim().toLowerCase();

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: input.userId },
      data: {
        ...encryptedAccountEmail(input.userId, email),
        ...(input.promoteToInstanceAdmin ? { role: "INSTANCE_ADMIN" as UserRole } : {}),
      },
      select: ACCOUNT_SELECT,
    }),
    prisma.userQuota.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId },
      update: {},
      select: { id: true },
    }),
  ]);

  return readAccountEmail(user);
}

/**
 * Records the successful sign in. Returns null when the account disappeared
 * between the callback and this write, so the sign in event never fails hard.
 */
export async function markSignedIn(
  userId: string,
  when = new Date()
): Promise<AccountSummary | null> {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: when },
      select: ACCOUNT_SELECT,
    });
    return readAccountEmail(user);
  } catch {
    return null;
  }
}

/**
 * Resolves the `Session.id` for a session token. The token itself is never
 * logged or returned; only the row id is handed back so that audit entries can
 * reference the session.
 */
export async function findSessionIdByToken(sessionToken: string): Promise<string | null> {
  const session = await prisma.session.findUnique({
    where: { sessionToken },
    select: { id: true },
  });
  return session?.id ?? null;
}

/** Number of sessions currently attached to an account, for the session UI. */
export async function countActiveSessions(userId: string): Promise<number> {
  return prisma.session.count({
    where: { userId, expires: { gt: new Date() } },
  });
}
