/** Operational review reminders; these do not alter legal or sending eligibility. */
export const BROKER_REVIEW_INTERVAL_DAYS = 90;
export const LEGAL_REVIEW_INTERVAL_DAYS = 180;
const DAY_MS = 86_400_000;

export function reviewCutoff(intervalDays: number, now = new Date()) {
  return new Date(now.getTime() - intervalDays * DAY_MS);
}

export function reviewAge(
  date: Date | null | undefined,
  intervalDays: number,
  now = new Date()
) {
  if (!date)
    return { state: "missing" as const, days: null, label: "No review date recorded" };
  if (date > now)
    return {
      state: "future" as const,
      days: null,
      label: "Review date is in the future",
    };
  const days = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  const state =
    date <= reviewCutoff(intervalDays, now) ? ("stale" as const) : ("current" as const);
  return {
    state,
    days,
    label: `Reviewed ${days} ${days === 1 ? "day" : "days"} ago${state === "stale" ? " · review due" : ""}`,
  };
}
