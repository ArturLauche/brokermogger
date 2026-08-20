/**
 * Header injection is the classic email vulnerability: a newline in a subject
 * or display name turns one header into two. These tests pin that behaviour
 * down for every field that can reach a message.
 */
import { describe, expect, it } from "vitest";

import { isAppError } from "@/lib/core/errors";
import {
  assertHeaderSafeRecord,
  assertSafeBody,
  formatRecipient,
  validateOutboundMessage,
} from "@/lib/email/validate";
import type { EmailMessage } from "@/lib/email/types";

function baseMessage(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    to: { address: "ada@example.org" },
    subject: "Removal request",
    text: "Please delete my personal data.",
    purpose: "NOTIFICATION",
    idempotencyKey: "notification-1",
    ...overrides,
  };
}

function expectUnsafe(action: () => unknown): void {
  try {
    action();
    throw new Error("Expected the value to be rejected");
  } catch (error) {
    expect(isAppError(error)).toBe(true);
    if (isAppError(error)) {
      expect(error.code).toBe("UNSAFE_INPUT");
    }
  }
}

describe("subject and display name injection", () => {
  it("rejects a subject containing CRLF", () => {
    expectUnsafe(() =>
      validateOutboundMessage(
        baseMessage({ subject: "Removal request\r\nBcc: attacker@example.net" })
      )
    );
  });

  it("rejects a subject containing a bare newline", () => {
    expectUnsafe(() =>
      validateOutboundMessage(baseMessage({ subject: "Removal\nrequest" }))
    );
  });

  it("rejects a display name containing CRLF", () => {
    expectUnsafe(() =>
      validateOutboundMessage(
        baseMessage({
          to: {
            address: "ada@example.org",
            displayName: "Ada\r\nBcc: attacker@example.net",
          },
        })
      )
    );
  });

  it("keeps a legitimate display name and quotes it for the transport", () => {
    const message = validateOutboundMessage(
      baseMessage({ to: { address: "Ada@Example.ORG", displayName: "Ada Lovelace" } })
    );

    expect(message.to.address).toBe("ada@example.org");
    expect(formatRecipient(message.to)).toBe('"Ada Lovelace" <ada@example.org>');
  });
});

describe("address validation", () => {
  it("rejects an address with a newline", () => {
    expectUnsafe(() =>
      validateOutboundMessage(baseMessage({ to: { address: "ada@example.org\nx" } }))
    );
  });

  it("rejects a reply-to that is not an address", () => {
    expectUnsafe(() =>
      validateOutboundMessage(baseMessage({ replyTo: "not-an-address" }))
    );
  });
});

describe("body validation", () => {
  it("normalises CRLF line endings", () => {
    expect(assertSafeBody("line one\r\nline two", "text")).toBe("line one\nline two");
  });

  it("rejects a stray carriage return", () => {
    expectUnsafe(() => assertSafeBody("line one\rBcc: attacker@example.net", "text"));
  });

  it("rejects a body that smuggles a header", () => {
    expectUnsafe(() => assertSafeBody("Bcc: attacker@example.net\n\nhello", "text"));
  });

  it("rejects a body containing a script tag", () => {
    expectUnsafe(() => assertSafeBody("<script>alert(1)</script>", "html"));
  });

  it("rejects an empty body", () => {
    expectUnsafe(() => assertSafeBody("   ", "text"));
  });
});

describe("custom headers", () => {
  it("rejects a header value with a newline", () => {
    expectUnsafe(() =>
      assertHeaderSafeRecord({ "X-Brokermogger-Note": "one\r\nX-Injected: yes" })
    );
  });

  it("rejects a header name that is not header safe", () => {
    expectUnsafe(() => assertHeaderSafeRecord({ "X Bad Header": "value" }));
  });

  it("rejects a transport controlled header", () => {
    expectUnsafe(() => assertHeaderSafeRecord({ Bcc: "attacker@example.net" }));
  });

  it("accepts a normal custom header", () => {
    expect(assertHeaderSafeRecord({ "X-Brokermogger-Purpose": "MAGIC_LINK" })).toEqual({
      "X-Brokermogger-Purpose": "MAGIC_LINK",
    });
  });
});

describe("tags", () => {
  it("rejects a tag value with a space", () => {
    expectUnsafe(() =>
      validateOutboundMessage(baseMessage({ tags: { purpose: "a b" } }))
    );
  });
});
