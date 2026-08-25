/**
 * Date windows for jobs, plus Resend webhook event classification.
 *
 * Classification lives here so the worker can apply provider vocabulary
 * without keeping it in the HTTP route. Retention and deadline jobs reuse the
 * same calendar helpers.
 */
export type EmailDeliveryOutcome = "delivered" | "bounced" | "complained" | "ignored";

const DELIVERED = new Set(["email.delivered", "delivered"]);

const BOUNCED = new Set(["email.bounced", "email.failed", "bounced", "failed"]);

const COMPLAINED = new Set(["email.complained", "complained", "complaint"]);

export function classifyEmailWebhook(eventType: string): EmailDeliveryOutcome {
  const normalised = eventType.trim().toLowerCase();
  if (DELIVERED.has(normalised)) return "delivered";
  if (BOUNCED.has(normalised)) return "bounced";
  if (COMPLAINED.has(normalised)) return "complained";
  return "ignored";
}

export function providerMessageIdFromPayload(
  payload: Record<string, unknown>
): string | null {
  const data = payload.data;
  if (!data || typeof data !== "object") {
    return typeof payload.email_id === "string" ? payload.email_id : null;
  }
  const record = data as Record<string, unknown>;
  if (typeof record.email_id === "string") return record.email_id;
  if (typeof record.id === "string") return record.id;
  return null;
}

export function monthsAgo(now: Date, months: number): Date {
  const copy = new Date(now.getTime());
  copy.setMonth(copy.getMonth() - months);
  return copy;
}

export function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function daysFromNow(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}
