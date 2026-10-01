import { isDeepStrictEqual } from "node:util";

/** Status is deliberately excluded: seeding must never revive retired content. */
export function hasSameSeedContent(actual: object, desired: object): boolean {
  const stored = actual as Record<string, unknown>;
  return Object.entries(desired).every(
    ([key, value]) => key === "status" || isDeepStrictEqual(stored[key], value)
  );
}
