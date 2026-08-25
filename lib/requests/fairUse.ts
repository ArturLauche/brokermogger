/**
 * Fair-use helpers that do not touch the database.
 *
 * Limits are operational. They are never a paid upgrade.
 */

/** How many brokers a brand-new account may target in one generate call. */
export const BULK_CREATE_WITHOUT_AGE_LIMIT = 5;

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
