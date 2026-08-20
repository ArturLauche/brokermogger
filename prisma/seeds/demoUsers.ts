/**
 * Optional demo accounts.
 *
 * Only created when `SEED_DEMO_USERS=true`, so a production instance never
 * gets accounts it did not ask for. There are no passwords anywhere in this
 * product: sign in happens through a magic link, so the demo accounts are just
 * verified email addresses with a role and a fair use quota.
 */
import type { PrismaClient, UserRole } from "@prisma/client";

import { emptyResult, type SeedStepResult } from "./types";

interface DemoUserSeed {
  email: string;
  name: string;
  role: UserRole;
  description: string;
}

const DEMO_USERS: DemoUserSeed[] = [
  {
    email: "admin@example.invalid",
    name: "Demo Instance Admin",
    role: "INSTANCE_ADMIN",
    description: "administration, settings and broker verification",
  },
  {
    email: "maintainer@example.invalid",
    name: "Demo Maintainer",
    role: "MAINTAINER",
    description: "broker data and legal rule maintenance",
  },
  {
    email: "user@example.invalid",
    name: "Demo User",
    role: "USER",
    description: "ordinary account that prepares and approves requests",
  },
];

export function demoUsersEnabled(): boolean {
  return process.env.SEED_DEMO_USERS === "true";
}

export async function seedDemoUsers(prisma: PrismaClient): Promise<SeedStepResult> {
  const result = emptyResult("Demo users");

  if (!demoUsersEnabled()) {
    result.notes.push("skipped, set SEED_DEMO_USERS=true to create the demo accounts");
    return result;
  }

  const verifiedAt = new Date();

  for (const demoUser of DEMO_USERS) {
    const existing = await prisma.user.findUnique({
      where: { email: demoUser.email },
      select: { id: true, emailVerified: true },
    });

    const data = {
      name: demoUser.name,
      role: demoUser.role,
      status: "ACTIVE" as const,
      // Keep an existing verification timestamp so repeated runs stay stable.
      emailVerified: existing?.emailVerified ?? verifiedAt,
    };

    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      create: { email: demoUser.email, ...data },
      update: data,
      select: { id: true },
    });

    await prisma.userQuota.upsert({
      where: { userId: user.id },
      create: { userId: user.id, notes: "Default fair use limits for the demo account." },
      update: {},
    });

    if (existing) {
      result.updated += 1;
    } else {
      result.created += 1;
    }

    result.notes.push(`${demoUser.email} (${demoUser.role}) for ${demoUser.description}`);
  }

  result.notes.push("Sign in with a magic link, there are no passwords.");

  return result;
}
