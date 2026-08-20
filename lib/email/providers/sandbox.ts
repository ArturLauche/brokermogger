/**
 * Sandbox email provider for staging.
 *
 * Sends through Resend, but every message is redirected to one inbox
 * (`EMAIL_SANDBOX_REDIRECT_TO`) so that a staging instance can exercise the real
 * transport without ever reaching a broker or a real person. The original
 * recipient is only carried as a masked value in `X-Brokermogger-Original-To`;
 * putting it into the subject would leak an address into mailbox previews,
 * notification popups and mail server logs.
 */
import type { EmailProviderKind } from "@prisma/client";

import { env } from "@/lib/config/env";
import { AppError } from "@/lib/core/errors";
import { createLogger } from "@/lib/observability/logger";
import { maskEmail } from "@/lib/security/masking";
import { assertValidEmailAddress, sanitiseHeaderValue } from "@/lib/security/sanitize";

import { instanceReplyToAddress } from "../messages";
import type { SendResult } from "../types";
import type { ValidatedEmailMessage } from "../validate";
import { BaseEmailProvider } from "./base";
import { dispatchThroughResend } from "./resendTransport";

const log = createLogger("email.sandbox");

export const SANDBOX_SUBJECT_PREFIX = "[sandbox]";
export const ORIGINAL_TO_HEADER = "X-Brokermogger-Original-To";

function redirectTarget(): string {
  const configured = env.EMAIL_SANDBOX_REDIRECT_TO;
  if (!configured) {
    throw new AppError({
      code: "EMAIL_FAILED",
      message:
        "EMAIL_SANDBOX_REDIRECT_TO is not configured, so the sandbox provider has nowhere to send to.",
      details: { emailProvider: env.EMAIL_PROVIDER },
    });
  }
  return assertValidEmailAddress(configured, "EMAIL_SANDBOX_REDIRECT_TO");
}

export class SandboxEmailProvider extends BaseEmailProvider {
  readonly kind: EmailProviderKind = "SANDBOX";

  protected async dispatch(message: ValidatedEmailMessage): Promise<SendResult> {
    const recipient = redirectTarget();
    const maskedOriginal = maskEmail(message.to.address);
    const subject = sanitiseHeaderValue(
      `${SANDBOX_SUBJECT_PREFIX} ${message.subject}`,
      "subject"
    );

    const providerMessageId = await dispatchThroughResend({
      message,
      from: this.fromAddress(),
      recipient,
      subject,
      replyTo: message.replyTo ?? instanceReplyToAddress(),
      extraHeaders: {
        [ORIGINAL_TO_HEADER]: maskedOriginal,
        "X-Brokermogger-Purpose": message.purpose,
      },
    });

    const sentAt = new Date();

    log.info(
      { purpose: message.purpose, maskedRecipient: maskedOriginal, providerMessageId },
      "Message redirected to the sandbox inbox"
    );

    return {
      provider: this.kind,
      providerMessageId,
      dispatched: true,
      suppressionReason: "sandbox_redirect",
      sentAt,
    };
  }
}
