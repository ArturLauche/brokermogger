import { z } from "zod";
import { ValidationError } from "@/lib/core/errors";
import { createCalendarDateFormatter } from "./datetime";

export const calendarDateSchema = z.iso
  .date()
  .refine(
    (value) => value >= "1000-01-01" && value <= "9998-12-31",
    "Enter a date between the years 1000 and 9998."
  );

/** Earliest instant in a local day, including missing or repeated midnight offsets. */
export function startOfCalendarDay(day: string, timeZone: string): Date {
  if (!calendarDateSchema.safeParse(day).success)
    throw new ValidationError("Enter a valid calendar date.");
  const utc = Date.parse(`${day}T00:00:00Z`);
  const formatDate = createCalendarDateFormatter(timeZone);
  let low = utc - 2 * 86_400_000;
  let high = utc + 2 * 86_400_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (formatDate(new Date(middle)) < day) low = middle + 1;
    else high = middle;
  }
  const result = new Date(low);
  if (formatDate(result) !== day)
    throw new ValidationError(
      "This calendar date does not exist in the account timezone."
    );
  return result;
}

export function addCalendarDays(day: string, amount: number): string {
  if (!calendarDateSchema.safeParse(day).success || !Number.isSafeInteger(amount))
    throw new ValidationError("Enter a valid calendar date and whole-day interval.");
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  const result = value.toISOString().slice(0, 10);
  if (!calendarDateSchema.safeParse(result).success)
    throw new ValidationError(
      "The calculated date is outside the supported calendar range."
    );
  return result;
}

/** Inclusive dates become a half-open interval of real instants, not fixed 24-hour days. */
export function calendarDateRange(from: string, to: string, timeZone: string) {
  const rangeStartAt = startOfCalendarDay(from, timeZone);
  let next = addCalendarDays(to, 1);
  for (let skipped = 0; skipped < 3; skipped += 1) {
    try {
      return { rangeStartAt, rangeEndAt: startOfCalendarDay(next, timeZone) };
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      next = addCalendarDays(next, 1);
    }
  }
  throw new ValidationError(
    "This date range cannot be represented in the account timezone."
  );
}
