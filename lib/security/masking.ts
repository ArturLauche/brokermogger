/**
 * Masking helpers.
 *
 * The UI shows masked previews wherever the full value is not required to make
 * a decision. Masked previews are also the only representation that may appear
 * in audit metadata, notifications or admin views.
 */
import type { IdentifierType } from "@prisma/client";

export function maskEmail(value: string): string {
  const trimmed = value.trim();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0) {
    return maskGeneric(trimmed);
  }

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const domainParts = domain.split(".");
  const tld = domainParts.length > 1 ? domainParts[domainParts.length - 1] : "";
  const domainName = domainParts.slice(0, -1).join(".") || domain;

  return `${keepEdges(local, 1, 0)}@${keepEdges(domainName, 1, 0)}${tld ? `.${tld}` : ""}`;
}

export function maskPhone(value: string): string {
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length <= 4) {
    return "*".repeat(digits.length);
  }
  const prefix = value.trim().startsWith("+") ? "+" : "";
  return `${prefix}${"*".repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
}

export function maskName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => (part.length <= 1 ? part : `${part[0]}${"*".repeat(part.length - 1)}`))
    .join(" ");
}

export function maskPostalAddress(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 6) {
    return "*".repeat(cleaned.length);
  }
  const parts = cleaned.split(",");
  const last = parts[parts.length - 1]?.trim() ?? "";
  return `${"*".repeat(6)}${last ? `, ${last}` : ""}`;
}

export function maskGeneric(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 2) {
    return "*".repeat(trimmed.length);
  }
  return keepEdges(trimmed, 1, 1);
}

function keepEdges(value: string, head: number, tail: number): string {
  if (value.length <= head + tail) {
    return "*".repeat(value.length);
  }
  const start = value.slice(0, head);
  const end = tail > 0 ? value.slice(value.length - tail) : "";
  return `${start}${"*".repeat(Math.max(value.length - head - tail, 1))}${end}`;
}

export function maskIdentifier(type: IdentifierType, value: string): string {
  switch (type) {
    case "EMAIL":
      return maskEmail(value);
    case "PHONE":
      return maskPhone(value);
    case "FULL_NAME":
    case "PREVIOUS_NAME":
      return maskName(value);
    case "POSTAL_ADDRESS":
    case "PREVIOUS_ADDRESS":
      return maskPostalAddress(value);
    case "APPROXIMATE_LOCATION":
      return value.trim().slice(0, 24);
    case "USERNAME":
    case "OTHER":
    default:
      return maskGeneric(value);
  }
}
