/**
 * Thin wrapper around the Resend SDK.
 *
 * Both the production adapter and the sandbox adapter send through this
 * function, so the HTTP behaviour, the idempotency key and the error mapping
 * exist exactly once. SDK errors become `AppError` with code `EMAIL_FAILED`;
 * the raw provider message is kept in `details` for the logs, never for the UI.
 */
import { Resend } from "resend";

import { env } from "@/lib/config/env";
import { AppError } from "@/lib/core/errors";

import type { ValidatedEmailMessage } from "../validate";
import { formatRecipient } from "../validate";

export interface ResendDispatchInput {
  message: ValidatedEmailMessage;
  from: string;
  /** Overrides `message.to`, used by the sandbox redirect. */
  recipient?: string;
  /** Overrides `message.subject`, used by the sandbox prefix. */
  subject?: string;
  replyTo?: string | undefined;
  extraHeaders?: Record<string, string>;
}

let client: Resend | undefined;

function getClient(): Resend {
  if (!env.RESEND_API_KEY) {
    throw new AppError({
      code: "EMAIL_FAILED",
      message:
        "The Resend API key is missing. Set RESEND_API_KEY or switch EMAIL_PROVIDER to mock.",
      details: { emailProvider: env.EMAIL_PROVIDER },
    });
  }

  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}

/** Test helper: drops the memoised SDK client. */
export function resetResendClientForTests(): void {
  client = undefined;
}

function toTagList(
  tags: Record<string, string> | undefined
): { name: string; value: string }[] {
  return Object.entries(tags ?? {}).map(([name, value]) => ({ name, value }));
}

/** Sends one message and returns the provider side message id. */
export async function dispatchThroughResend(input: ResendDispatchInput): Promise<string> {
  const { message } = input;
  const recipient = input.recipient ?? formatRecipient(message.to);
  const headers = { ...(message.headers ?? {}), ...(input.extraHeaders ?? {}) };

  const response = await getClient()
    .emails.send(
      {
        from: input.from,
        to: recipient,
        subject: input.subject ?? message.subject,
        text: message.text,
        ...(message.html === undefined ? {} : { html: message.html }),
        ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
        ...(Object.keys(headers).length === 0 ? {} : { headers }),
        tags: [
          { name: "purpose", value: message.purpose.toLowerCase() },
          ...toTagList(message.tags),
        ],
      },
      { idempotencyKey: message.idempotencyKey }
    )
    .catch((error: unknown) => {
      throw new AppError({
        code: "EMAIL_FAILED",
        message: "The email provider could not be reached.",
        details: { purpose: message.purpose, provider: "resend" },
        cause: error,
      });
    });

  if (response.error || !response.data) {
    throw new AppError({
      code: "EMAIL_FAILED",
      message: "The email provider rejected the message.",
      details: {
        purpose: message.purpose,
        provider: "resend",
        providerError: response.error?.name ?? "unknown_error",
        statusCode: response.error?.statusCode ?? null,
      },
    });
  }

  return response.data.id;
}
