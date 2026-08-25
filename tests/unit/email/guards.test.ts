/**
 * "Nothing leaves the instance without explicit approval" starts with the
 * operator switch. Real providers must refuse broker mail while
 * ALLOW_EXTERNAL_SENDING is false. The mock adapter is allowed because it
 * never touches the network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetEnvCacheForTests } from "@/lib/config/env";
import { isAppError } from "@/lib/core/errors";
import {
  assertAdminSendingEnabled,
  assertOutboundAllowed,
  isExternalPurpose,
} from "@/lib/email";
import { MockEmailProvider } from "@/lib/email/providers/mock";

function withExternalSending(enabled: boolean): void {
  vi.stubEnv("ALLOW_EXTERNAL_SENDING", enabled ? "true" : "false");
  if (enabled) {
    vi.stubEnv("EMAIL_PROVIDER", "sandbox");
    vi.stubEnv("EMAIL_SANDBOX_REDIRECT_TO", "sandbox@example.invalid");
    vi.stubEnv("APP_ENV", "staging");
  }
  resetEnvCacheForTests();
}

function withSandboxSendingDisabled(): void {
  vi.stubEnv("ALLOW_EXTERNAL_SENDING", "false");
  vi.stubEnv("EMAIL_PROVIDER", "sandbox");
  vi.stubEnv("EMAIL_SANDBOX_REDIRECT_TO", "sandbox@example.invalid");
  vi.stubEnv("APP_ENV", "staging");
  resetEnvCacheForTests();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCacheForTests();
});

describe("assertOutboundAllowed", () => {
  it("classifies broker purposes as external", () => {
    expect(isExternalPurpose("BROKER_REQUEST")).toBe(true);
    expect(isExternalPurpose("BROKER_FOLLOW_UP")).toBe(true);
    expect(isExternalPurpose("MAGIC_LINK")).toBe(false);
    expect(isExternalPurpose("NOTIFICATION")).toBe(false);
  });

  it("allows mock broker sends so the local workflow can be exercised", () => {
    withExternalSending(false);
    expect(() => assertOutboundAllowed("BROKER_REQUEST")).not.toThrow();
  });

  it("blocks a broker request on a real provider while external sending is off", () => {
    withSandboxSendingDisabled();

    try {
      assertOutboundAllowed("BROKER_REQUEST");
      throw new Error("Expected the guard to block the send");
    } catch (error) {
      expect(isAppError(error)).toBe(true);
      if (isAppError(error)) {
        expect(error.code).toBe("EXTERNAL_SENDING_DISABLED");
        expect(error.message).toContain("ALLOW_EXTERNAL_SENDING");
        expect(error.message).toContain("EMAIL_PROVIDER");
      }
    }
  });

  it("blocks a follow up on a real provider while external sending is off", () => {
    withSandboxSendingDisabled();
    expect(() => assertOutboundAllowed("BROKER_FOLLOW_UP")).toThrow();
  });

  it("allows magic links and notifications while external sending is off", () => {
    withExternalSending(false);
    expect(() => assertOutboundAllowed("MAGIC_LINK")).not.toThrow();
    expect(() => assertOutboundAllowed("NOTIFICATION")).not.toThrow();
    expect(() => assertOutboundAllowed("ACCOUNT_SECURITY")).not.toThrow();
  });

  it("allows a broker request once the operator enabled sending", () => {
    withExternalSending(true);
    expect(() => assertOutboundAllowed("BROKER_REQUEST")).not.toThrow();
  });

  it("lets the mock provider capture a broker request locally", async () => {
    withExternalSending(false);

    const result = await new MockEmailProvider().sendBrokerRequestEmail({
      to: { address: "privacy@broker.example" },
      replyTo: "replies@example.invalid",
      subject: "Deletion request",
      text: "Please delete the personal data you hold about me.",
      removalRequestId: "request-1",
      brokerId: "broker-1",
      attempt: 1,
      isFollowUp: false,
    });

    expect(result.dispatched).toBe(false);
    expect(result.suppressionReason).toBe("mock_provider");
    expect(result.provider).toBe("MOCK");
  });
});

describe("assertAdminSendingEnabled", () => {
  it("lets the mock provider ignore the admin sending switch", () => {
    withExternalSending(false);
    expect(() => assertAdminSendingEnabled("BROKER_REQUEST", false)).not.toThrow();
  });

  it("blocks a real provider when the admin sending switch is off", () => {
    withExternalSending(true);
    expect(() => assertAdminSendingEnabled("BROKER_REQUEST", false)).toThrow();
  });

  it("allows a real provider when both operator switches are on", () => {
    withExternalSending(true);
    expect(() => assertAdminSendingEnabled("BROKER_REQUEST", true)).not.toThrow();
  });
});
