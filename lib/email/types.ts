/**
 * Email provider contract.
 *
 * Three implementations exist: MockEmailProvider (development and tests),
 * SandboxEmailProvider (staging, redirects everything to one inbox) and
 * ResendEmailProvider (production default). Nothing else in the codebase may
 * talk to an email API directly.
 */
import type { EmailPurpose, EmailProviderKind } from "@prisma/client";

export interface EmailAddress {
  address: string;
  displayName?: string;
}

export interface EmailMessage {
  to: EmailAddress;
  subject: string;
  /** Plain text body. Always required, broker requests are text only. */
  text: string;
  /** Optional escaped HTML body. Never used for broker requests. */
  html?: string;
  replyTo?: string;
  purpose: EmailPurpose;
  /** Provider level idempotency key, mirrored into OutboundEmail. */
  idempotencyKey: string;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
}

export interface SendResult {
  provider: EmailProviderKind;
  /** Provider side id, used to correlate webhooks. Null for the mock provider. */
  providerMessageId: string | null;
  /** True when the message actually left the instance. */
  dispatched: boolean;
  /** Set when the provider suppressed the message, e.g. sandbox redirect. */
  suppressionReason?: string;
  sentAt: Date;
}

export interface MagicLinkEmailInput {
  to: EmailAddress;
  url: string;
  expiresAt: Date;
  requestIpHint?: string;
}

export interface BrokerRequestEmailInput {
  to: EmailAddress;
  replyTo: string;
  subject: string;
  text: string;
  removalRequestId: string;
  brokerId: string;
  attempt: number;
  isFollowUp: boolean;
}

export interface NotificationEmailInput {
  to: EmailAddress;
  subject: string;
  text: string;
  html?: string;
  notificationId: string;
}

export interface EmailProvider {
  readonly kind: EmailProviderKind;
  sendEmail(message: EmailMessage): Promise<SendResult>;
  sendMagicLinkEmail(input: MagicLinkEmailInput): Promise<SendResult>;
  sendBrokerRequestEmail(input: BrokerRequestEmailInput): Promise<SendResult>;
  sendNotificationEmail(input: NotificationEmailInput): Promise<SendResult>;
}
