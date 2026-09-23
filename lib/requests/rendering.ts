import { sha256Hex } from "@/lib/security/crypto";
import { IDENTIFIER_TYPE_LABELS } from "./labels";

export function requestReference(requestId: string): string {
  return `BM-${sha256Hex(requestId).slice(0, 32).toUpperCase()}`;
}

export function formatIdentifierList(
  items: { type: keyof typeof IDENTIFIER_TYPE_LABELS; value: string }[]
): string {
  return items
    .map((item) => `- ${IDENTIFIER_TYPE_LABELS[item.type] ?? item.type}: ${item.value}`)
    .join("\n");
}
