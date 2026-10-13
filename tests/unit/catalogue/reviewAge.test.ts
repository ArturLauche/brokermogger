import { expect, it } from "vitest";
import { reviewAge, reviewCutoff } from "@/lib/catalogue/reviewAge";
it("handles missing/future dates and exact operational review boundaries", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const cutoff = reviewCutoff(90, now);
  expect(reviewAge(null, 90, now).state).toBe("missing");
  expect(reviewAge(new Date(now.getTime() + 1), 90, now).state).toBe("future");
  expect(reviewAge(cutoff, 90, now)).toMatchObject({ state: "stale", days: 90 });
  expect(reviewAge(new Date(cutoff.getTime() + 1), 90, now).state).toBe("current");
});
