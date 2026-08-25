import { describe, expect, it } from "vitest";

import type { EmailStatus } from "@prisma/client";

import {
  isOutboundAttemptComplete,
  outboundAttemptLeftTheInstance,
} from "@/lib/email/outboundStatus";

const ALL_STATUSES: EmailStatus[] = [
  "QUEUED",
  "SENT",
  "DELIVERED",
  "BOUNCED",
  "COMPLAINED",
  "FAILED",
  "SUPPRESSED",
];

describe("outbound attempt completeness", () => {
  it("treats in-flight and failed rows as resumable", () => {
    expect(isOutboundAttemptComplete("QUEUED")).toBe(false);
    expect(isOutboundAttemptComplete("FAILED")).toBe(false);
  });

  it("treats terminal provider outcomes as complete", () => {
    expect(isOutboundAttemptComplete("SENT")).toBe(true);
    expect(isOutboundAttemptComplete("DELIVERED")).toBe(true);
    expect(isOutboundAttemptComplete("BOUNCED")).toBe(true);
    expect(isOutboundAttemptComplete("COMPLAINED")).toBe(true);
    expect(isOutboundAttemptComplete("SUPPRESSED")).toBe(true);
  });

  it("counts only messages that left the instance as dispatched", () => {
    expect(outboundAttemptLeftTheInstance("SENT")).toBe(true);
    expect(outboundAttemptLeftTheInstance("SUPPRESSED")).toBe(false);
    expect(outboundAttemptLeftTheInstance("QUEUED")).toBe(false);
    expect(outboundAttemptLeftTheInstance("FAILED")).toBe(false);
  });

  it("covers every EmailStatus", () => {
    for (const status of ALL_STATUSES) {
      expect(typeof isOutboundAttemptComplete(status)).toBe("boolean");
    }
  });
});
