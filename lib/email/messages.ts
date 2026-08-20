/**
 * Message builders.
 *
 * The provider adapters share these builders so that the mock, sandbox and
 * production paths produce byte identical content. Broker request bodies are
 * rendered by the template layer and only passed through here, magic link and
 * notification copy lives in this module.
 *
 * Tone rules from AGENTS.md apply: calm, factual, no urgency tricks, no emojis.
 */
import { env } from "@/lib/config/env";
import { sha256Hex } from "@/lib/security/crypto";
import { formatAddress, parseAddress } from "@/lib/security/sanitize";

import type {
  BrokerRequestEmailInput,
  EmailAddress,
  EmailMessage,
  MagicLinkEmailInput,
  NotificationEmailInput,
} from "./types";

/** Validated `From` header for this instance, built from `EMAIL_FROM`. */
export function instanceFromAddress(): string {
  const parsed = parseAddress(env.EMAIL_FROM);
  return parsed.displayName
    ? formatAddress(parsed.address, parsed.displayName)
    : formatAddress(parsed.address);
}

export function instanceReplyToAddress(): string | undefined {
  return env.EMAIL_REPLY_TO;
}

function formatUtc(value: Date): string {
  return `${value.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function minutesUntil(value: Date, now = new Date()): number {
  return Math.max(Math.round((value.getTime() - now.getTime()) / 60_000), 1);
}

export function buildMagicLinkMessage(input: MagicLinkEmailInput): EmailMessage {
  const minutes = minutesUntil(input.expiresAt);

  const lines = [
    "Someone asked for a sign in link for this address on Brokermogger.",
    "",
    "Open this link to sign in:",
    input.url,
    "",
    `The link can be used once and expires in about ${minutes} minutes (${formatUtc(
      input.expiresAt
    )}).`,
  ];

  if (input.requestIpHint) {
    lines.push("", `Requested from: ${input.requestIpHint}`);
  }

  lines.push(
    "",
    "If you did not ask for this link, you can ignore this message. Nobody can",
    "sign in to your account without opening the link.",
    "",
    "This address is only used to sign you in and to reply about your requests."
  );

  return {
    to: input.to,
    subject: "Your Brokermogger sign in link",
    text: lines.join("\n"),
    purpose: "MAGIC_LINK",
    idempotencyKey: `magic-link-${sha256Hex(input.url).slice(0, 32)}`,
    tags: { purpose: "magic_link" },
  };
}

export function buildBrokerRequestMessage(input: BrokerRequestEmailInput): EmailMessage {
  return {
    to: input.to,
    subject: input.subject,
    text: input.text,
    replyTo: input.replyTo,
    purpose: input.isFollowUp ? "BROKER_FOLLOW_UP" : "BROKER_REQUEST",
    idempotencyKey: `request-${input.removalRequestId}-${input.attempt}-${
      input.isFollowUp ? "follow-up" : "initial"
    }`,
    tags: {
      purpose: input.isFollowUp ? "broker_follow_up" : "broker_request",
      attempt: String(input.attempt),
    },
  };
}

export interface ConsentInviteEmailInput {
  to: EmailAddress;
  acceptUrl: string;
  requesterDisplayName: string;
  expiresAt: Date;
}

export function buildConsentInviteMessage(input: ConsentInviteEmailInput): EmailMessage {
  const minutes = minutesUntil(input.expiresAt);
  const lines = [
    `${input.requesterDisplayName} asked to manage privacy requests on your behalf in Brokermogger.`,
    "",
    "If you are an adult and you agree, open this link:",
    input.acceptUrl,
    "",
    `The link can be used once and expires in about ${minutes} minutes (${formatUtc(
      input.expiresAt
    )}).`,
    "",
    "You can agree or decline on that page. Nothing is sent to a data broker until you agree and the account holder later approves a request.",
    "",
    "If you were not expecting this message, you can ignore it.",
  ];

  return {
    to: input.to,
    subject: "Confirm household privacy requests in Brokermogger",
    text: lines.join("\n"),
    purpose: "CONSENT_INVITE",
    idempotencyKey: `consent-invite-${sha256Hex(input.acceptUrl).slice(0, 32)}`,
    tags: { purpose: "consent_invite" },
  };
}

export function buildNotificationMessage(input: NotificationEmailInput): EmailMessage {
  const message: EmailMessage = {
    to: input.to,
    subject: input.subject,
    text: input.text,
    purpose: "NOTIFICATION",
    idempotencyKey: `notification-${input.notificationId}`,
    tags: { purpose: "notification" },
  };

  if (input.html !== undefined) {
    message.html = input.html;
  }

  return message;
}
