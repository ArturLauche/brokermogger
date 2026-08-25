import { describe, expect, it } from "vitest";

import { canTransition } from "@/lib/requests/stateMachine";

describe("state machine coverage for worker outcomes", () => {
  it("allows a bounce from SENT and a missed deadline from WAITING_FOR_BROKER", () => {
    expect(canTransition("SENT", "FAILED", "SYSTEM")).toBe(true);
    expect(canTransition("WAITING_FOR_BROKER", "NO_RESPONSE", "SYSTEM")).toBe(true);
    expect(canTransition("FOLLOW_UP_SCHEDULED", "AWAITING_USER_APPROVAL", "SYSTEM")).toBe(
      true
    );
    expect(canTransition("SENT", "NO_RESPONSE", "SYSTEM")).toBe(false);
  });
});
