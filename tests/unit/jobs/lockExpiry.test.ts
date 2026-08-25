import { describe, expect, it } from "vitest";

import { jobStatusAfterStaleLock } from "@/lib/jobs/lockExpiry";

describe("jobStatusAfterStaleLock", () => {
  it("retries when attempts remain", () => {
    expect(jobStatusAfterStaleLock(1, 5)).toBe("RETRYABLE");
    expect(jobStatusAfterStaleLock(4, 5)).toBe("RETRYABLE");
  });

  it("fails when the lock expired on the last attempt", () => {
    expect(jobStatusAfterStaleLock(5, 5)).toBe("FAILED");
    expect(jobStatusAfterStaleLock(6, 5)).toBe("FAILED");
  });
});
