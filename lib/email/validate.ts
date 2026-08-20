/**
 * Outbound message validation.
 *
 * Every message is validated here before any provider sees it. The goal is that
 * a provider adapter can be dumb: by the time it runs, addresses are valid and
 * lowercased, the subject and display name are header safe, custom headers
 * cannot inject a second header, and the body carries no CR/LF or HTML
 * injection artefacts.
 */
import { AppError } from "@/lib/core/errors";
import {
  assertValidEmailAddress,
  detectSuspiciousContent,
  sanitiseHeaderValue,
} from "@/lib/security/sanitize";

import type { EmailAddress, EmailMessage } from "./types";

export const MAX_BODY_LENGTH = 100_000;

/** Headers a caller must never set: they are owned by the transport. */
const RESERVED_HEADER_NAMES = new Set([
  "to",
  "from",
  "cc",
  "bcc",
  "reply-to",
  "subject",
  "content-type",
  "content-transfer-encoding",
  "mime-version",
  "date",
  "message-id",
  "return-path",
]);

const HEADER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]{0,62}$/;
const TAG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** A message that passed validation. Providers accept nothing else. */
export interface ValidatedEmailMessage extends EmailMessage {
  to: { address: string; displayName?: string };
}

function unsafe(message: string, details: Record<string, unknown>): AppError {
  return new AppError({ code: "UNSAFE_INPUT", message, details });
}

export function validateAddress(
  input: EmailAddress,
  fieldName: string
): { address: string; displayName?: string } {
  const address = assertValidEmailAddress(input.address, `${fieldName}.address`);

  if (input.displayName === undefined) {
    return { address };
  }

  const displayName = sanitiseHeaderValue(input.displayName, `${fieldName}.displayName`);
  return { address, displayName };
}

/**
 * Rejects a body that contains carriage returns, other control characters or
 * markup that could be interpreted as an injection. `\r\n` pairs are normalised
 * to `\n` first, because that is a legitimate line ending, but a lone `\r` or a
 * stray `\r` inside a line is treated as an injection attempt.
 */
export function assertSafeBody(value: string, fieldName: string): string {
  if (value.trim().length === 0) {
    throw unsafe(`The field "${fieldName}" must not be empty.`, { fieldName });
  }

  if (value.length > MAX_BODY_LENGTH) {
    throw unsafe(
      `The field "${fieldName}" is longer than ${MAX_BODY_LENGTH} characters.`,
      {
        fieldName,
        maxLength: MAX_BODY_LENGTH,
      }
    );
  }

  const normalised = value.replace(/\r\n/g, "\n");
  if (normalised.includes("\r")) {
    throw unsafe(`The field "${fieldName}" must not contain carriage returns.`, {
      fieldName,
      reason: "carriage_return_in_body",
    });
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalised)) {
    throw unsafe(`The field "${fieldName}" contains unsupported control characters.`, {
      fieldName,
      reason: "control_character_in_body",
    });
  }

  const suspicious = detectSuspiciousContent(normalised);
  if (suspicious.length > 0) {
    throw unsafe(`The field "${fieldName}" contains content that cannot be sent.`, {
      fieldName,
      findings: suspicious,
    });
  }

  return normalised;
}

export function assertHeaderSafeRecord(
  headers: Record<string, string>
): Record<string, string> {
  const safe: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!HEADER_NAME_PATTERN.test(name)) {
      throw unsafe(`The header name "${name}" is not allowed.`, {
        headerName: name,
        reason: "invalid_header_name",
      });
    }

    if (RESERVED_HEADER_NAMES.has(name.toLowerCase())) {
      throw unsafe(`The header "${name}" is controlled by the transport.`, {
        headerName: name,
        reason: "reserved_header",
      });
    }

    safe[name] = sanitiseHeaderValue(value, `header.${name}`);
  }

  return safe;
}

export function assertSafeTags(tags: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};

  for (const [name, value] of Object.entries(tags)) {
    if (!TAG_PATTERN.test(name) || !TAG_PATTERN.test(value)) {
      throw unsafe(`The tag "${name}" must use letters, digits, "-" or "_" only.`, {
        tagName: name,
        reason: "invalid_tag",
      });
    }
    safe[name] = value;
  }

  return safe;
}

/** Full validation pass. Returns a normalised copy of the message. */
export function validateOutboundMessage(message: EmailMessage): ValidatedEmailMessage {
  const to = validateAddress(message.to, "to");
  const subject = sanitiseHeaderValue(message.subject, "subject");
  const text = assertSafeBody(message.text, "text");

  const validated: ValidatedEmailMessage = {
    to,
    subject,
    text,
    purpose: message.purpose,
    idempotencyKey: sanitiseHeaderValue(message.idempotencyKey, "idempotencyKey"),
  };

  if (message.html !== undefined) {
    validated.html = assertSafeBody(message.html, "html");
  }

  if (message.replyTo !== undefined) {
    validated.replyTo = assertValidEmailAddress(message.replyTo, "replyTo");
  }

  if (message.headers !== undefined) {
    validated.headers = assertHeaderSafeRecord(message.headers);
  }

  if (message.tags !== undefined) {
    validated.tags = assertSafeTags(message.tags);
  }

  return validated;
}

/** `"Display Name" <address>` for transports that take a single string. */
export function formatRecipient(to: { address: string; displayName?: string }): string {
  if (!to.displayName) {
    return to.address;
  }
  return `"${to.displayName.replace(/["\\]/g, "")}" <${to.address}>`;
}
