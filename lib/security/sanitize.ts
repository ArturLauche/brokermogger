/**
 * Input sanitisation for everything that can end up in an outbound message.
 *
 * Threat model:
 *  - Email header injection through newlines in names, subjects or addresses.
 *  - Hidden instruction injection through bidirectional or zero width unicode.
 *  - HTML or script injection into the HTML rendering of a request.
 *  - Oversized values used to break rendering or exhaust storage.
 */
import { AppError } from "@/lib/core/errors";

/** Control characters except tab and newline. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
/** Bidi overrides, zero width characters, byte order mark. */
const INVISIBLE_CHARACTERS =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const NEWLINES = /[\r\n]/g;

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export const MAX_INLINE_VARIABLE_LENGTH = 200;
export const MAX_BLOCK_VARIABLE_LENGTH = 2000;
export const MAX_SUBJECT_LENGTH = 200;

/**
 * Patterns that indicate an attempt to smuggle protocol level content into a
 * message. Hits do not silently pass: the caller either rejects the value or
 * escalates the request to manual review.
 */
const SUSPICIOUS_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern: /^\s*(bcc|cc|to|from|reply-to|content-type|mime-version)\s*:/im,
    label: "email_header",
  },
  { pattern: /<\s*script/i, label: "script_tag" },
  { pattern: /javascript\s*:/i, label: "javascript_url" },
  { pattern: /data\s*:\s*text\/html/i, label: "data_url" },
  { pattern: /<\s*iframe/i, label: "iframe_tag" },
  { pattern: /\bon(?:error|load|click|mouseover)\s*=/i, label: "inline_event_handler" },
];

export function stripInvisible(value: string): string {
  return value.replace(INVISIBLE_CHARACTERS, "");
}

export function stripControlCharacters(value: string): string {
  return value.replace(CONTROL_CHARACTERS, "");
}

export function normaliseWhitespace(value: string): string {
  return value
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface SanitiseOptions {
  /** Inline values must not contain newlines (names, subjects, addresses). */
  multiline?: boolean;
  maxLength?: number;
  fieldName?: string;
}

/**
 * Cleans a user supplied value for use inside a rendered request.
 * Throws when the value is empty after cleaning or exceeds the length budget.
 */
export function sanitiseText(value: string, options: SanitiseOptions = {}): string {
  const multiline = options.multiline ?? false;
  const maxLength =
    options.maxLength ??
    (multiline ? MAX_BLOCK_VARIABLE_LENGTH : MAX_INLINE_VARIABLE_LENGTH);
  const fieldName = options.fieldName ?? "value";

  let cleaned = stripInvisible(stripControlCharacters(value));
  cleaned = multiline ? cleaned.replace(/\r\n?/g, "\n") : cleaned.replace(NEWLINES, " ");
  cleaned = normaliseWhitespace(cleaned);

  if (cleaned.length === 0) {
    throw new AppError({
      code: "UNSAFE_INPUT",
      message: `The field "${fieldName}" is empty after removing unsupported characters.`,
      details: { fieldName },
    });
  }

  if (cleaned.length > maxLength) {
    throw new AppError({
      code: "UNSAFE_INPUT",
      message: `The field "${fieldName}" is longer than the allowed ${maxLength} characters.`,
      details: { fieldName, maxLength },
    });
  }

  return cleaned;
}

/** Returns the labels of all suspicious patterns found in a value. */
export function detectSuspiciousContent(value: string): string[] {
  return SUSPICIOUS_PATTERNS.filter(({ pattern }) => pattern.test(value)).map(
    ({ label }) => label
  );
}

/**
 * Sanitises a value that becomes part of an email header.
 * Any newline, control character or overlong value is rejected outright.
 */
export function sanitiseHeaderValue(value: string, fieldName: string): string {
  if (NEWLINES.test(value)) {
    throw new AppError({
      code: "UNSAFE_INPUT",
      message: `The field "${fieldName}" must not contain line breaks.`,
      details: { fieldName, reason: "newline_in_header" },
    });
  }

  return sanitiseText(value, {
    multiline: false,
    maxLength: MAX_SUBJECT_LENGTH,
    fieldName,
  });
}

export function isValidEmailAddress(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length <= 254 &&
    EMAIL_PATTERN.test(trimmed) &&
    !NEWLINES.test(trimmed) &&
    stripInvisible(trimmed) === trimmed
  );
}

export function assertValidEmailAddress(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!isValidEmailAddress(trimmed)) {
    throw new AppError({
      code: "UNSAFE_INPUT",
      message: `"${fieldName}" is not a valid email address.`,
      details: { fieldName },
    });
  }
  return trimmed.toLowerCase();
}

/**
 * Parses `Display Name <address@example.org>` or a bare address.
 * The display name is stripped of anything that could break a header.
 */
export function parseAddress(input: string): { displayName?: string; address: string } {
  const match = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(input);
  if (match) {
    const [, rawName, rawAddress] = match;
    const address = assertValidEmailAddress(rawAddress ?? "", "address");
    const displayName = rawName ? sanitiseHeaderValue(rawName, "displayName") : undefined;
    return displayName ? { displayName, address } : { address };
  }

  return { address: assertValidEmailAddress(input, "address") };
}

export function formatAddress(address: string, displayName?: string): string {
  const safeAddress = assertValidEmailAddress(address, "address");
  if (!displayName) {
    return safeAddress;
  }
  const safeName = sanitiseHeaderValue(displayName, "displayName").replace(/["\\]/g, "");
  return `"${safeName}" <${safeAddress}>`;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"'/]/g, (character) => HTML_ESCAPES[character] ?? character);
}

/** Extracts the registrable domain part of an email address, lowercased. */
export function emailDomain(address: string): string {
  const atIndex = address.lastIndexOf("@");
  return atIndex === -1
    ? ""
    : address
        .slice(atIndex + 1)
        .trim()
        .toLowerCase();
}

/** Rejects URLs that are not plain https (or http on localhost during development). */
export function assertSafeHttpUrl(value: string, fieldName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new AppError({
      code: "UNSAFE_INPUT",
      message: `"${fieldName}" is not a valid URL.`,
      details: { fieldName },
    });
  }

  const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocalhost)) {
    throw new AppError({
      code: "UNSAFE_INPUT",
      message: `"${fieldName}" must use https.`,
      details: { fieldName, protocol: parsed.protocol },
    });
  }

  return parsed.toString();
}
