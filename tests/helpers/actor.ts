import type { ActorContext } from "@/lib/permissions/actor";
import type { UserRole } from "@prisma/client";

export function testActor(
  userId: string,
  role: UserRole = "USER",
  extra: Partial<ActorContext> = {}
): ActorContext {
  return {
    userId,
    role,
    emailIndex: null,
    sessionId: null,
    requestId: `test-${userId}`,
    ipHash: null,
    userAgentHash: null,
    adminGrant: null,
    isSystem: false,
    ...extra,
  };
}
