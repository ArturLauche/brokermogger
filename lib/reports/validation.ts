import { z } from "zod";
import { ValidationError } from "@/lib/core/errors";
import { dateInTimeZone } from "@/lib/format/datetime";
import { entityIdSchema } from "@/lib/validation/ids";

const calendarDate = z.iso
  .date()
  .refine(
    (value) => value >= "1000-01-01" && value <= "9998-12-31",
    "Enter a date between the years 1000 and 9998."
  );
/** Date-only input, including leap-day validation; timestamps are not calendar dates. */
export const reportInputSchema = z
  .object({
    profileId: entityIdSchema.nullable(),
    dateFrom: calendarDate,
    dateTo: calendarDate,
    format: z.enum(["PDF", "JSON"]),
    submissionKey: z.uuid(),
  })
  .superRefine((value, context) => {
    if (
      !z.iso.date().safeParse(value.dateFrom).success ||
      !z.iso.date().safeParse(value.dateTo).success
    )
      return;
    if (value.dateTo < value.dateFrom)
      context.addIssue({
        code: "custom",
        path: ["dateTo"],
        message: "The end date must be on or after the start date.",
      });
    const from = new Date(`${value.dateFrom}T00:00:00Z`);
    const last = new Date(from);
    last.setUTCFullYear(
      Math.min(9999, from.getUTCFullYear() + 2),
      from.getUTCMonth() + 1,
      0
    );
    last.setUTCDate(Math.min(from.getUTCDate(), last.getUTCDate()));
    if (value.dateTo > last.toISOString().slice(0, 10))
      context.addIssue({
        code: "custom",
        path: ["dateTo"],
        message: "The date range cannot exceed 24 months.",
      });
  });
export type ReportCommand = z.infer<typeof reportInputSchema>;

/** Earliest instant in a local calendar day, including midnight offset changes. */
export function startOfCalendarDay(day: string, timeZone: string): Date {
  const checked = z.iso.date().safeParse(day);
  if (!checked.success) throw new ValidationError("Enter a valid calendar date.");
  const utc = Date.parse(`${day}T00:00:00Z`);
  let low = utc - 2 * 86_400_000;
  let high = utc + 2 * 86_400_000;
  // Local midnight can be missing or repeated. Searching dates avoids inventing
  // a fixed 24-hour day or guessing an ambiguous UTC offset.
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (dateInTimeZone(new Date(middle), timeZone) < day) low = middle + 1;
    else high = middle;
  }
  const result = new Date(low);
  if (dateInTimeZone(result, timeZone) !== day)
    throw new ValidationError(
      "This calendar date does not exist in the account timezone."
    );
  return result;
}

export function reportDateRange(from: string, to: string, timeZone: string) {
  const next = new Date(`${to}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  // Find the first actual day after the end date, allowing a historically skipped day.
  let end: Date | undefined;
  for (let skipped = 0; skipped < 3; skipped += 1) {
    try {
      end = startOfCalendarDay(next.toISOString().slice(0, 10), timeZone);
      break;
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      next.setUTCDate(next.getUTCDate() + 1);
    }
  }
  if (!end)
    throw new ValidationError(
      "This date range cannot be represented in the account timezone."
    );
  return { rangeStartAt: startOfCalendarDay(from, timeZone), rangeEndAt: end };
}
