import { describe, expect, it } from "vitest";

import { parseJobPayload, isKnownJobType } from "@/lib/jobs/payloads";
import { ValidationError } from "@/lib/core/errors";

describe("job payload schemas", () => {
  it.each(["__proto__", "constructor", "toString"])(
    "rejects inherited property %s as a job type",
    (value) => {
      expect(isKnownJobType(value)).toBe(false);
    }
  );
  it("accepts a well formed SEND_REQUEST payload", () => {
    expect(
      parseJobPayload("SEND_REQUEST", {
        removalRequestId: "clxxxxxxxxxxxxxxxxxxxx",
        snapshotId: "clxxxxxxxxxxxxxxxxxxxx",
        attempt: 1,
      })
    ).toEqual({
      removalRequestId: "clxxxxxxxxxxxxxxxxxxxx",
      snapshotId: "clxxxxxxxxxxxxxxxxxxxx",
      attempt: 1,
    });
  });

  it("rejects a missing identifier", () => {
    expect(() => parseJobPayload("SEND_REQUEST", { attempt: 1 })).toThrow(
      ValidationError
    );
  });

  it("rejects an out of range attempt", () => {
    expect(() =>
      parseJobPayload("SEND_REQUEST", {
        removalRequestId: "r1",
        snapshotId: "s1",
        attempt: 0,
      })
    ).toThrow(ValidationError);
  });

  it("accepts RETENTION_SWEEP dryRun", () => {
    expect(parseJobPayload("RETENTION_SWEEP", { dryRun: true })).toEqual({
      dryRun: true,
    });
  });
});
