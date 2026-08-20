/**
 * Account bootstrap and the outbound email ledger, both against a real
 * database. These are the database side effects the Auth.js callbacks rely on.
 */
import { describe, expect, it, vi } from "vitest";

import { resetEnvCacheForTests } from "@/lib/config/env";
import {
  countActiveSessions,
  findAccountByEmail,
  findSessionIdByToken,
  initialiseNewAccount,
  markSignedIn,
} from "@/lib/db/repositories/users";
import {
  hasAlreadySent,
  recordQueuedEmail,
  recordSendFailure,
  recordSendResult,
} from "@/lib/email/ledger";
import { decryptField } from "@/lib/security/crypto";

import { testPrisma } from "../../helpers/db";

async function createUser(email: string): Promise<string> {
  const user = await testPrisma.user.create({ data: { email }, select: { id: true } });
  return user.id;
}

describe("initialiseNewAccount", () => {
  it("normalises the address and creates the quota row", async () => {
    const userId = await createUser("Ada@Example.ORG");

    const account = await initialiseNewAccount({
      userId,
      email: "Ada@Example.ORG",
      promoteToInstanceAdmin: false,
    });

    expect(account.email).toBe("ada@example.org");
    expect(account.role).toBe("USER");
    expect(account.status).toBe("ACTIVE");

    const quota = await testPrisma.userQuota.findUniqueOrThrow({ where: { userId } });
    expect(quota.userId).toBe(userId);

    expect(await findAccountByEmail("ADA@EXAMPLE.ORG")).not.toBeNull();
  });

  it("promotes an operator listed in INSTANCE_ADMIN_EMAILS", async () => {
    const userId = await createUser("owner@example.org");

    const account = await initialiseNewAccount({
      userId,
      email: "owner@example.org",
      promoteToInstanceAdmin: true,
    });

    expect(account.role).toBe("INSTANCE_ADMIN");
  });

  it("is safe to run twice", async () => {
    const userId = await createUser("ada@example.org");

    await initialiseNewAccount({
      userId,
      email: "ada@example.org",
      promoteToInstanceAdmin: false,
    });
    await initialiseNewAccount({
      userId,
      email: "ada@example.org",
      promoteToInstanceAdmin: false,
    });

    expect(await testPrisma.userQuota.count({ where: { userId } })).toBe(1);
  });
});

describe("sign in bookkeeping", () => {
  it("records the last sign in", async () => {
    const userId = await createUser("ada@example.org");

    const before = await testPrisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(before.lastLoginAt).toBeNull();

    const account = await markSignedIn(userId, new Date("2026-08-15T12:00:00.000Z"));
    expect(account?.lastLoginAt?.toISOString()).toBe("2026-08-15T12:00:00.000Z");
  });

  it("returns null instead of throwing for an account that vanished", async () => {
    expect(await markSignedIn("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("resolves a session id from its token and counts active sessions", async () => {
    const userId = await createUser("ada@example.org");
    const session = await testPrisma.session.create({
      data: {
        userId,
        sessionToken: "session-token-value",
        expires: new Date(Date.now() + 60_000),
      },
    });

    expect(await findSessionIdByToken("session-token-value")).toBe(session.id);
    expect(await findSessionIdByToken("unknown-token")).toBeNull();
    expect(await countActiveSessions(userId)).toBe(1);
  });
});

describe("outbound email ledger", () => {
  it("stores the recipient encrypted, masked and blind indexed", async () => {
    const entry = await recordQueuedEmail({
      purpose: "MAGIC_LINK",
      provider: "MOCK",
      toAddress: "Ada@Example.ORG",
      subject: "Your Brokermogger sign in link",
      body: "Open this link to sign in.",
      fromAddress: "Brokermogger <no-reply@example.invalid>",
    });

    const row = await testPrisma.outboundEmail.findUniqueOrThrow({
      where: { id: entry.id },
    });

    expect(row.status).toBe("QUEUED");
    expect(row.toAddressMasked).toBe("a**@e******.org");
    expect(row.toAddressHash).toBe(entry.toAddressHash);
    expect(row.toAddressEnc).not.toContain("ada@example.org");
    expect(
      decryptField(row.toAddressEnc, {
        table: "OutboundEmail",
        column: "toAddressEnc",
        recordId: row.id,
      })
    ).toBe("ada@example.org");

    // The body is only ever a hash.
    expect(row.bodyHash).toHaveLength(64);
    expect(JSON.stringify(row)).not.toContain("Open this link to sign in.");
  });

  it("records the provider outcome and a failure", async () => {
    const queued = await recordQueuedEmail({
      purpose: "NOTIFICATION",
      provider: "MOCK",
      toAddress: "ada@example.org",
      subject: "A broker answered",
      body: "One of your requests received a response.",
      fromAddress: "Brokermogger <no-reply@example.invalid>",
    });

    await recordSendResult(queued.id, {
      provider: "MOCK",
      providerMessageId: null,
      dispatched: false,
      sentAt: new Date("2026-08-15T12:00:00.000Z"),
      suppressionReason: "mock_provider",
    });

    const suppressed = await testPrisma.outboundEmail.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(suppressed.status).toBe("SUPPRESSED");
    expect(suppressed.sentAt?.toISOString()).toBe("2026-08-15T12:00:00.000Z");

    await recordSendFailure(queued.id, "provider rejected the message");
    const failed = await testPrisma.outboundEmail.findUniqueOrThrow({
      where: { id: queued.id },
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.lastError).toBe("provider rejected the message");
  });

  it("deduplicates a broker send per request, purpose and attempt", async () => {
    vi.stubEnv("ALLOW_EXTERNAL_SENDING", "true");
    vi.stubEnv("EMAIL_PROVIDER", "sandbox");
    vi.stubEnv("EMAIL_SANDBOX_REDIRECT_TO", "sandbox@example.invalid");
    resetEnvCacheForTests();

    const userId = await createUser("ada@example.org");
    const profile = await testPrisma.userProfile.create({
      data: {
        ownerUserId: userId,
        kind: "SELF",
        displayName: "Primary",
        countryCode: "DE",
        consentStatus: "SELF",
        isPrimary: true,
      },
      select: { id: true },
    });
    const broker = await testPrisma.broker.create({
      data: {
        slug: "example-broker",
        legalName: "Example Broker GmbH",
        category: "PEOPLE_SEARCH",
      },
      select: { id: true },
    });
    const jurisdiction = await testPrisma.jurisdiction.create({
      data: { code: "DE", name: "Germany", countryCode: "DE" },
      select: { id: true },
    });
    const removalRequest = await testPrisma.removalRequest.create({
      data: {
        userId,
        profileId: profile.id,
        brokerId: broker.id,
        jurisdictionId: jurisdiction.id,
        requestType: "DELETION",
        channel: "EMAIL",
        legalBasisText: "Article 17 GDPR",
      },
      select: { id: true },
    });

    expect(await hasAlreadySent(removalRequest.id, "BROKER_REQUEST", 1)).toBe(false);

    const first = await recordQueuedEmail({
      purpose: "BROKER_REQUEST",
      provider: "SANDBOX",
      toAddress: "privacy@broker.example",
      subject: "Deletion request",
      body: "Please delete the personal data you hold about me.",
      fromAddress: "Brokermogger <no-reply@example.invalid>",
      removalRequestId: removalRequest.id,
      userId,
      profileId: profile.id,
      attempt: 1,
    });

    expect(await hasAlreadySent(removalRequest.id, "BROKER_REQUEST", 1)).toBe(true);
    expect(await hasAlreadySent(removalRequest.id, "BROKER_REQUEST", 2)).toBe(false);
    expect(await hasAlreadySent(removalRequest.id, "BROKER_FOLLOW_UP", 1)).toBe(false);

    // The unique constraint is the real safety net against a double send.
    await expect(
      recordQueuedEmail({
        purpose: "BROKER_REQUEST",
        provider: "SANDBOX",
        toAddress: "privacy@broker.example",
        subject: "Deletion request",
        body: "Please delete the personal data you hold about me.",
        fromAddress: "Brokermogger <no-reply@example.invalid>",
        removalRequestId: removalRequest.id,
        attempt: 1,
      })
    ).rejects.toThrow();

    // A failed attempt may be retried.
    await recordSendFailure(first.id, "temporary provider error");
    expect(await hasAlreadySent(removalRequest.id, "BROKER_REQUEST", 1)).toBe(false);

    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });
});
