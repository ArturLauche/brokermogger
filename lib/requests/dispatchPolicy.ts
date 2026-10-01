/** Resend retains idempotency keys for 24 hours; reserve five minutes for transport. */
export const SAFE_REPLAY_WINDOW_MS = (24 * 60 - 5) * 60_000;

export function needsDeliveryReconciliation(
  startedAt: Date | null,
  now = new Date()
): boolean {
  return (
    startedAt !== null && now.getTime() - startedAt.getTime() >= SAFE_REPLAY_WINDOW_MS
  );
}
