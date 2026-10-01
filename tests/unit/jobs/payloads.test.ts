import { describe, expect, it } from "vitest";

import { parseJobPayload, isKnownJobType } from "@/lib/jobs/payloads";
import { ValidationError } from "@/lib/core/errors";
import {
  MAX_STORED_DISPATCH_ATTEMPT,
  nextDispatchAttempt,
} from "@/lib/requests/dispatchAttempt";

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

  it.each([20, 21, 2_147_483_647])("accepts stored send attempt %i", (attempt) => {
    expect(
      parseJobPayload("SEND_REQUEST", {
        removalRequestId: "clxxxxxxxxxxxxxxxxxxxx",
        snapshotId: "clxxxxxxxxxxxxxxxxxxxx",
        attempt,
      })
    ).toMatchObject({ attempt });
  });

  it.each([-1, 1.5, 2_147_483_648, Infinity, NaN])(
    "rejects a send attempt that cannot be stored: %s",
    (attempt) => {
      expect(() =>
        parseJobPayload("SEND_REQUEST", {
          removalRequestId: "clxxxxxxxxxxxxxxxxxxxx",
          snapshotId: "clxxxxxxxxxxxxxxxxxxxx",
          attempt,
        })
      ).toThrow(ValidationError);
    }
  );

  it("keeps counter allocation within the shared storage contract", () => {
    expect(nextDispatchAttempt(null)).toBe(1);
    expect(nextDispatchAttempt(20)).toBe(21);
    expect(nextDispatchAttempt(MAX_STORED_DISPATCH_ATTEMPT - 1)).toBe(
      MAX_STORED_DISPATCH_ATTEMPT
    );
    expect(() => nextDispatchAttempt(MAX_STORED_DISPATCH_ATTEMPT)).toThrow(
      expect.objectContaining({ code: "CONFLICT" })
    );
  });

  it("accepts RETENTION_SWEEP dryRun", () => {
    expect(parseJobPayload("RETENTION_SWEEP", { dryRun: true })).toEqual({
      dryRun: true,
    });
  });
});
