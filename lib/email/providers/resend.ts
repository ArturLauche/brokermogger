/**
 * Production email provider backed by Resend.
 *
 * Sets the instance reply-to so broker answers arrive at an inbox this instance
 * can process, tags every message for deliverability reporting and passes the
 * message idempotency key to the provider so a retry cannot send twice.
 */
import type { EmailProviderKind } from "@prisma/client";

import { createLogger } from "@/lib/observability/logger";
import { maskEmail } from "@/lib/security/masking";

import { instanceReplyToAddress } from "../messages";
import type { SendResult } from "../types";
import type { ValidatedEmailMessage } from "../validate";
import { BaseEmailProvider } from "./base";
import { dispatchThroughResend } from "./resendTransport";

const log = createLogger("email.resend");

export class ResendEmailProvider extends BaseEmailProvider {
  readonly kind: EmailProviderKind = "RESEND";

  protected async dispatch(message: ValidatedEmailMessage): Promise<SendResult> {
    const replyTo = message.replyTo ?? instanceReplyToAddress();

    const providerMessageId = await dispatchThroughResend({
      message,
      from: this.fromAddress(),
      replyTo,
      extraHeaders: { "X-Brokermogger-Purpose": message.purpose },
    });

    const sentAt = new Date();

    log.info(
      {
        purpose: message.purpose,
        maskedRecipient: maskEmail(message.to.address),
        providerMessageId,
      },
      "Message handed to the email provider"
    );

    return {
      provider: this.kind,
      providerMessageId,
      dispatched: true,
      sentAt,
    };
  }
}
