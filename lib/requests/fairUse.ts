/**
 * Fair-use helpers that do not touch the database.
 *
 * Limits are operational. They are never a paid upgrade.
 */

import { ValidationError } from "@/lib/core/errors";

/** How many brokers a brand-new account may target in one generate call. */
export const BULK_CREATE_WITHOUT_AGE_LIMIT = 5;

/**
 * Hard ceiling for unique brokers in one generate call. Matches the compiled
 * maximum of `fairUseRequestsPerDay` (1000) so a crafted payload cannot outrun
 * the daily setting schema.
 */
export const MAX_BROKERS_PER_WORKFLOW = 1000;

export function isAccountTooNewForBulk(input: {
  createdAt: Date | null;
  minimumAgeHours: number;
  now?: Date;
}): boolean {
  if (input.minimumAgeHours <= 0 || !input.createdAt) {
    return false;
  }
  const now = input.now ?? new Date();
  return (
    now.getTime() - input.createdAt.getTime() < input.minimumAgeHours * 60 * 60 * 1000
  );
}

/** First-seen order, duplicates removed, empty strings dropped. */
export function normalizeBrokerIds(ids: readonly string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    unique.push(trimmed);
  }
  return unique;
}

export function assertBrokerSelectionSize(count: number): void {
  if (count < 1) {
    throw new ValidationError("Select at least one broker.");
  }
  if (count > MAX_BROKERS_PER_WORKFLOW) {
    throw new ValidationError(
      `A single workflow can target at most ${MAX_BROKERS_PER_WORKFLOW} brokers.`
    );
  }
}
