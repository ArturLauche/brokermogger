/**
 * Job retry backoff.
 *
 * Exponential with full jitter so a burst of failures does not retry in lock
 * step. The result is a delay in seconds to add to `now` when a job is marked
 * RETRYABLE.
 */
export function backoffSeconds(
  attemptCount: number,
  options: { baseSeconds?: number; maxSeconds?: number; random?: () => number } = {}
): number {
  const base = options.baseSeconds ?? 15;
  const max = options.maxSeconds ?? 30 * 60;
  const random = options.random ?? Math.random;
  const exp = Math.min(max, base * 2 ** Math.max(attemptCount - 1, 0));
  return Math.max(1, Math.floor(random() * exp));
}
