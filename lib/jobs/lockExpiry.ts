/**
 * Status after a worker died while a job was RUNNING and the lock timed out.
 *
 * Claim increments `attemptCount` up front. If that last attempt never
 * finishes, the row must become FAILED so `ensureRecurringJob` can revive
 * recurring work and so claim does not spin on an unreachable RETRYABLE row.
 */
export function jobStatusAfterStaleLock(
  attemptCount: number,
  maxAttempts: number
): "FAILED" | "RETRYABLE" {
  return attemptCount >= maxAttempts ? "FAILED" : "RETRYABLE";
}
