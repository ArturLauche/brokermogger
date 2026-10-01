import { z } from "zod";
import { AppError } from "@/lib/core/errors";

// OutboundEmail.attempt is a PostgreSQL Int, not a lifetime approval/retry limit.
// Every fresh approval reserves a counter; worker retries reuse that counter.
export const MAX_STORED_DISPATCH_ATTEMPT = 2_147_483_647;
export const dispatchAttemptSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_STORED_DISPATCH_ATTEMPT);

export function nextDispatchAttempt(latest: number | null): number {
  const next = dispatchAttemptSchema.safeParse((latest ?? 0) + 1);
  if (!next.success)
    throw new AppError({
      code: "CONFLICT",
      message:
        "This request cannot reserve another send attempt. Ask the instance operator to review its history.",
    });
  return next.data;
}
