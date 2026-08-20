/**
 * Shared shape of a seed step result so that `prisma/seed.ts` can print one
 * summary table no matter which writer produced the numbers.
 */

export interface SeedStepResult {
  /** Label shown in the summary table. */
  step: string;
  created: number;
  updated: number;
  /** Rows the writer deliberately left alone, for example admin edited ones. */
  skipped: number;
  /** Child rows removed because they are no longer part of the seed data. */
  removed: number;
  /** Short lines printed under the table, for example demo account emails. */
  notes: string[];
}

export function emptyResult(step: string): SeedStepResult {
  return { step, created: 0, updated: 0, skipped: 0, removed: 0, notes: [] };
}
