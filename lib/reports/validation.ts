import { z } from "zod";
import { calendarDateSchema } from "@/lib/format/calendar";
export {
  calendarDateRange as reportDateRange,
  startOfCalendarDay,
} from "@/lib/format/calendar";
import { entityIdSchema } from "@/lib/validation/ids";

/** Date-only input, including leap-day validation; timestamps are not calendar dates. */
export const reportInputSchema = z
  .object({
    profileId: entityIdSchema.nullable(),
    dateFrom: calendarDateSchema,
    dateTo: calendarDateSchema,
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
