/** Sourced response targets. Extensions are never applied without a recorded decision. */
import { z } from "zod";
import type { DeadlineBasis } from "@prisma/client";
import { ValidationError } from "@/lib/core/errors";
import {
  addCalendarDays,
  calendarDateRange,
  calendarDateSchema,
} from "@/lib/format/calendar";
import { dateInTimeZone } from "@/lib/format/datetime";

const sourceUrl = z
  .url()
  .refine(
    (value) => URL.canParse(value) && new URL(value).protocol === "https:",
    "Use an HTTPS source URL."
  );
export const holidayCalendarSchema = z
  .object({
    validFrom: calendarDateSchema,
    validThrough: calendarDateSchema,
    holidays: z.array(calendarDateSchema).max(1000),
    nonWorkingWeekdays: z.array(z.number().int().min(0).max(6)).max(6),
    sourceUrl,
    reviewedOn: calendarDateSchema,
    verified: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.validThrough < value.validFrom)
      context.addIssue({
        code: "custom",
        path: ["validThrough"],
        message: "Calendar coverage must end on or after its start.",
      });
    if (value.holidays.some((day) => day < value.validFrom || day > value.validThrough))
      context.addIssue({
        code: "custom",
        path: ["holidays"],
        message: "Holiday dates must fall inside the declared calendar coverage.",
      });
    if (
      new Set(value.holidays).size !== value.holidays.length ||
      new Set(value.nonWorkingWeekdays).size !== value.nonWorkingWeekdays.length
    )
      context.addIssue({
        code: "custom",
        message: "Calendar dates and non-working weekdays must be unique.",
      });
  });
export const deadlinePolicySchema = z
  .object({
    version: z.literal(1),
    unit: z.enum(["NONE", "CALENDAR_DAYS", "CALENDAR_MONTHS", "BUSINESS_DAYS"]),
    period: z.number().int().min(1).max(366).nullable(),
    startsFrom: z.literal("RECEIPT"),
    sourceUrl,
    verified: z.boolean(),
    rollForward: z.enum(["NONE", "NEXT_WORKING_DAY"]),
    calendar: holidayCalendarSchema.nullable(),
    extension: z
      .object({
        unit: z.enum(["CALENDAR_DAYS", "CALENDAR_MONTHS", "BUSINESS_DAYS"]),
        period: z.number().int().min(1).max(366),
        noticeRequired: z.boolean(),
        conditions: z.string().trim().min(1).max(4000),
      })
      .strict()
      .nullable(),
    conditions: z.array(z.string().trim().min(1).max(2000)).max(30),
    notes: z.string().trim().max(4000),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.unit === "NONE") !== (value.period === null))
      context.addIssue({
        code: "custom",
        path: ["period"],
        message:
          "A response period is required unless the policy explicitly has no deadline.",
      });
    if (value.unit === "CALENDAR_MONTHS" && (value.period ?? 0) > 24)
      context.addIssue({
        code: "custom",
        path: ["period"],
        message: "A calendar-month response period cannot exceed 24 months.",
      });
    if (value.extension?.unit === "CALENDAR_MONTHS" && value.extension.period > 24)
      context.addIssue({
        code: "custom",
        path: ["extension", "period"],
        message: "A calendar-month extension cannot exceed 24 months.",
      });
  });
export type DeadlinePolicy = z.infer<typeof deadlinePolicySchema>;

export function calendarMonthsFrom(day: string, months: number): string {
  if (
    !calendarDateSchema.safeParse(day).success ||
    !Number.isSafeInteger(months) ||
    months < 0 ||
    months > 24
  )
    throw new ValidationError(
      "Enter a valid calendar date and a month interval between 0 and 24."
    );
  const value = new Date(`${day}T00:00:00Z`);
  const target = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months + 1, 0)
  );
  target.setUTCDate(Math.min(value.getUTCDate(), target.getUTCDate()));
  const result = target.toISOString().slice(0, 10);
  if (!calendarDateSchema.safeParse(result).success)
    throw new ValidationError(
      "The calculated date is outside the supported calendar range."
    );
  return result;
}

/** Only explicitly versioned policies are executable; legacy day counts are not inferred. */
export function readDeadlinePolicy(raw: unknown) {
  const nested = raw && typeof raw === "object" && "policy" in raw ? raw.policy : raw;
  const parsed = deadlinePolicySchema.safeParse(nested);
  return parsed.success ? parsed.data : null;
}

export function responseTarget(input: {
  policy: unknown;
  receiptOn?: string | null;
  submittedOn?: string | null;
  dispatchedAt?: Date | null;
  providerDeliveredAt?: Date | null;
  simulated?: boolean;
  timeZone: string;
}) {
  const policy = readDeadlinePolicy(input.policy);
  const basis: DeadlineBasis = input.simulated
    ? "SIMULATED_DISPATCH"
    : input.receiptOn
      ? "RECORDED_RECEIPT"
      : input.providerDeliveredAt
        ? "PROVIDER_DELIVERY_ESTIMATE"
        : "DISPATCH_ESTIMATE";
  const instant = input.providerDeliveredAt ?? input.dispatchedAt;
  const anchor =
    input.receiptOn ??
    input.submittedOn ??
    (instant ? dateInTimeZone(instant, input.timeZone) : null);
  if (anchor && !calendarDateSchema.safeParse(anchor).success)
    throw new ValidationError("Enter a valid submission or receipt date.");
  const empty = {
    deadlineAt: null as Date | null,
    deadlineOn: null as Date | null,
    deadlineAnchorOn: anchor ? new Date(`${anchor}T00:00:00Z`) : null,
    deadlineBasis: anchor ? basis : null,
    deadlineIsEstimate: true,
    deadlineTimezone: input.timeZone,
    deadlinePolicyVersion: policy ? 1 : null,
    deadlineNote: policy
      ? "No fixed statutory response period is recorded."
      : "This legacy or invalid timing policy requires review. No response date was invented.",
  };
  if (!policy || policy.unit === "NONE") return empty;
  if (!anchor)
    return {
      ...empty,
      deadlineNote:
        "The response clock has not started. Record submission or receipt first.",
    };
  const holidays = new Set(policy.calendar?.holidays ?? []);
  const nonWorkingWeekdays = new Set(policy.calendar?.nonWorkingWeekdays ?? [0, 6]);
  let calendarComplete = true;
  const workingDay = (day: string) => {
    if (
      !policy.calendar?.verified ||
      day < policy.calendar.validFrom ||
      day > policy.calendar.validThrough
    )
      calendarComplete = false;
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    return !nonWorkingWeekdays.has(weekday) && !holidays.has(day);
  };
  let target = anchor;
  try {
    if (policy.unit === "CALENDAR_MONTHS")
      target = calendarMonthsFrom(anchor, policy.period!);
    else if (policy.unit === "CALENDAR_DAYS")
      target = addCalendarDays(anchor, policy.period!);
    else {
      let remaining = policy.period!;
      while (remaining > 0) {
        target = addCalendarDays(target, 1);
        if (workingDay(target)) remaining -= 1;
      }
    }
    if (policy.rollForward === "NEXT_WORKING_DAY")
      while (!workingDay(target)) target = addCalendarDays(target, 1);
    const approximateCalendar = !calendarComplete;
    const estimated =
      basis !== "RECORDED_RECEIPT" || !policy.verified || approximateCalendar;
    const note = [
      basis === "SIMULATED_DISPATCH"
        ? "Simulation only; no broker was contacted."
        : basis === "RECORDED_RECEIPT"
          ? "Based on the receipt date recorded by the account holder."
          : "Estimated from dispatch or provider delivery; broker receipt is unconfirmed.",
      !policy.verified ? "The response period requires source verification." : "",
      approximateCalendar
        ? "Public-holiday coverage is unverified or incomplete; confirm the applicable calendar."
        : "",
      "Extensions and verification pauses are not applied automatically. Reminder times use the recorded account timezone; the broker’s applicable cutoff may differ.",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      ...empty,
      deadlineOn: new Date(`${target}T00:00:00Z`),
      deadlineAt: calendarDateRange(target, target, input.timeZone).rangeEndAt,
      deadlineAnchorOn: new Date(`${anchor}T00:00:00Z`),
      deadlineBasis: basis,
      deadlineIsEstimate: estimated,
      deadlineNote: note,
    };
  } catch (error) {
    // A bad legacy date must not roll back an already accepted email or invent a date.
    if (!(error instanceof ValidationError)) throw error;
    return {
      ...empty,
      deadlineNote:
        "The response date cannot be represented in the recorded timezone or calendar range. Review the timing policy manually.",
    };
  }
}

export function responseTargetLabel(isEstimate: boolean) {
  return isEstimate
    ? "Estimated response target"
    : "Response target from recorded receipt";
}
