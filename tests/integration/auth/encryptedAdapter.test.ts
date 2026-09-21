import { describe, expect, it } from "vitest";

import { createAuthAdapter } from "@/lib/db/repositories/authAdapter";
import { testPrisma } from "../../helpers/db";

describe("encrypted Auth.js adapter", () => {
  const adapter = createAuthAdapter();
  const userInput = {
    id: "ignored",
    email: "Private@Example.ORG",
    emailVerified: null,
    role: "USER" as const,
    status: "ACTIVE" as const,
  };

  it("preserves the user/session contract without persisting the login address", async () => {
    const user = await adapter.createUser!(userInput);
    const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(user.email).toBe("private@example.org");
    expect(stored.email).toMatch(/@account.invalid$/);
    expect(JSON.stringify(stored)).not.toContain("private@example.org");
    expect((await adapter.getUserByEmail!("PRIVATE@example.org"))?.id).toBe(user.id);
    await adapter.createSession!({
      userId: user.id,
      sessionToken: "test-private-session",
      expires: new Date(Date.now() + 60_000),
    });
    const session = await adapter.getSessionAndUser!("test-private-session");
    expect(session?.user.email).toBe("private@example.org");
    expect(await adapter.deleteSession!("test-private-session")).toMatchObject({
      userId: user.id,
    });
    expect(await adapter.deleteSession!("test-private-session")).toBeNull();
    expect(await adapter.getSessionAndUser!("test-private-session")).toBeNull();
  });

  it("stores only blind indexes for magic-link identities and consumes tokens once", async () => {
    const input = {
      identifier: "private@example.org",
      token: "synthetic-token-hash",
      expires: new Date(Date.now() + 60_000),
    };
    expect(await adapter.createVerificationToken!(input)).toEqual(input);
    expect(JSON.stringify(await testPrisma.verificationToken.findMany())).not.toContain(
      input.identifier
    );
    const results = await Promise.all([
      adapter.useVerificationToken!(input),
      adapter.useVerificationToken!(input),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.find(Boolean)).toEqual(input);
  });

  it("blocks both existing and new sessions immediately when deletion is pending", async () => {
    const user = await adapter.createUser!(userInput);
    const session = {
      userId: user.id,
      sessionToken: "to-be-revoked",
      expires: new Date(Date.now() + 60_000),
    };
    await adapter.createSession!(session);
    await testPrisma.user.update({
      where: { id: user.id },
      data: { deletionRequestedAt: new Date(), status: "PENDING_DELETION" },
    });
    expect(await adapter.getSessionAndUser!(session.sessionToken)).toBeNull();
    await expect(
      adapter.createSession!({ ...session, sessionToken: "refused" })
    ).rejects.toThrow();
  });
});
