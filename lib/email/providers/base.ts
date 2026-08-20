/**
 * Shared behaviour for every email provider adapter.
 *
 * The base class owns the parts that must never differ between adapters:
 * the outbound sending guard, message validation and the message builders.
 * A concrete adapter only implements `dispatch()`, which receives a message
 * that is already known to be safe.
 */
import type { EmailProviderKind } from "@prisma/client";

import type {
  BrokerRequestEmailInput,
  EmailMessage,
  EmailProvider,
  MagicLinkEmailInput,
  NotificationEmailInput,
  SendResult,
} from "../types";
import { assertOutboundAllowed } from "../guards";
import {
  buildBrokerRequestMessage,
  buildMagicLinkMessage,
  buildNotificationMessage,
  instanceFromAddress,
} from "../messages";
import { validateOutboundMessage, type ValidatedEmailMessage } from "../validate";

export abstract class BaseEmailProvider implements EmailProvider {
  abstract readonly kind: EmailProviderKind;

  async sendEmail(message: EmailMessage): Promise<SendResult> {
    // Configuration first: an operator switch is a clearer error than a
    // sanitisation complaint about a message that must not be sent anyway.
    assertOutboundAllowed(message.purpose);
    const validated = validateOutboundMessage(message);
    return this.dispatch(validated);
  }

  async sendMagicLinkEmail(input: MagicLinkEmailInput): Promise<SendResult> {
    return this.sendEmail(buildMagicLinkMessage(input));
  }

  async sendBrokerRequestEmail(input: BrokerRequestEmailInput): Promise<SendResult> {
    return this.sendEmail(buildBrokerRequestMessage(input));
  }

  async sendNotificationEmail(input: NotificationEmailInput): Promise<SendResult> {
    return this.sendEmail(buildNotificationMessage(input));
  }

  protected fromAddress(): string {
    return instanceFromAddress();
  }

  protected abstract dispatch(message: ValidatedEmailMessage): Promise<SendResult>;
}
