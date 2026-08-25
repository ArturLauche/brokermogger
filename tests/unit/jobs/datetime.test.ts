import { describe, expect, it } from "vitest";

import {
  classifyEmailWebhook,
  daysAgo,
  monthsAgo,
  providerMessageIdFromPayload,
} from "@/lib/jobs/datetime";

describe("classifyEmailWebhook", () => {
  it("maps Resend event types", () => {
    expect(classifyEmailWebhook("email.delivered")).toBe("delivered");
    expect(classifyEmailWebhook("email.bounced")).toBe("bounced");
    expect(classifyEmailWebhook("email.complained")).toBe("complained");
    expect(classifyEmailWebhook("email.opened")).toBe("ignored");
  });
});

describe("providerMessageIdFromPayload", () => {
  it("reads Resend data.email_id", () => {
    expect(providerMessageIdFromPayload({ data: { email_id: "msg_123" } })).toBe(
      "msg_123"
    );
  });

  it("returns null when the payload has no id", () => {
    expect(providerMessageIdFromPayload({ data: {} })).toBeNull();
  });
});

describe("date windows", () => {
  it("moves a calendar month and a day count", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    expect(monthsAgo(now, 1).toISOString()).toBe("2026-07-25T12:00:00.000Z");
    expect(daysAgo(now, 1).toISOString()).toBe("2026-08-24T12:00:00.000Z");
  });
});
