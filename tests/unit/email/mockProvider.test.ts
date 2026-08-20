/**
 * The mock provider is the guarantee that a development instance never sends a
 * real email. These tests check the outbox, the written file and the fact that
 * the result is reported as not dispatched.
 */
import { readFile, rm } from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { env } from "@/lib/config/env";
import { clearMockOutbox, getMockOutbox, MockEmailProvider } from "@/lib/email";

const provider = new MockEmailProvider();

beforeEach(() => {
  clearMockOutbox();
});

afterEach(async () => {
  await rm(env.MOCK_EMAIL_DIR, { recursive: true, force: true });
});

describe("mock email provider", () => {
  it("captures a magic link in the outbox without dispatching it", async () => {
    const result = await provider.sendMagicLinkEmail({
      to: { address: "ada@example.org" },
      url: "http://localhost:3000/api/auth/callback/magic-link?token=abc&email=ada%40example.org",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    expect(result.provider).toBe("MOCK");
    expect(result.dispatched).toBe(false);
    expect(result.suppressionReason).toBe("mock_provider");
    expect(result.providerMessageId).toBeNull();

    const outbox = getMockOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.message.purpose).toBe("MAGIC_LINK");
    expect(outbox[0]?.message.to.address).toBe("ada@example.org");
    expect(outbox[0]?.message.text).toContain("token=abc");
  });

  it("writes a readable file into MOCK_EMAIL_DIR", async () => {
    await provider.sendNotificationEmail({
      to: { address: "ada@example.org" },
      subject: "A broker answered",
      text: "One of your requests received a response.",
      notificationId: "notification-1",
    });

    const entry = getMockOutbox()[0];
    expect(entry?.filePath).toBeTruthy();

    const content = await readFile(entry?.filePath ?? "", "utf8");
    expect(content).toContain("Subject: A broker answered");
    expect(content).toContain("To: ada@example.org");
    expect(content).toContain("X-Brokermogger-Purpose: NOTIFICATION");
    expect(content).toContain("One of your requests received a response.");
  });

  it("clears the outbox on request", async () => {
    await provider.sendNotificationEmail({
      to: { address: "ada@example.org" },
      subject: "A broker answered",
      text: "One of your requests received a response.",
      notificationId: "notification-2",
    });

    expect(getMockOutbox()).toHaveLength(1);
    clearMockOutbox();
    expect(getMockOutbox()).toHaveLength(0);
  });

  it("refuses a magic link for an invalid address", async () => {
    await expect(
      provider.sendMagicLinkEmail({
        to: { address: "not-an-address" },
        url: "http://localhost:3000/api/auth/callback/magic-link?token=abc",
        expiresAt: new Date(Date.now() + 60_000),
      })
    ).rejects.toMatchObject({ code: "UNSAFE_INPUT" });

    expect(getMockOutbox()).toHaveLength(0);
  });
});
