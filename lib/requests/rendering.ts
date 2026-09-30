import { sha256Hex } from "@/lib/security/crypto";
import type { RequestDelivery } from "@/lib/brokers/sendable";
import { AppError } from "@/lib/core/errors";
import { IDENTIFIER_TYPE_LABELS } from "./labels";

/** Only the digest is persisted outside the encrypted message envelope. */
export function sendingIdentityVariables(identity: {
  fromAddress: string;
  replyTo: string;
}) {
  return {
    sendingIdentityDigest: sha256Hex(
      JSON.stringify({
        fromAddress: identity.fromAddress,
        replyTo: identity.replyTo,
      })
    ),
  };
}

export function assertRenderedSendingIdentity(
  variables: Record<string, string>,
  identity: { fromAddress: string; replyTo: string }
) {
  if (
    variables.sendingIdentityDigest !==
    sendingIdentityVariables(identity).sendingIdentityDigest
  )
    throw new AppError({
      code: "CONFLICT",
      message:
        "The instance sending or reply address changed. Regenerate the message before reviewing it again.",
    });
}

/** Bind freshly rendered channel instructions to the destination used at commit. */
export function deliveryVariables(delivery: RequestDelivery) {
  return {
    deliveryDigest: sha256Hex(
      JSON.stringify({
        channel: delivery.channel,
        destinationType: delivery.destinationType,
        destinationValue: delivery.destinationValue,
      })
    ),
  };
}

export function assertRenderedDelivery(
  variables: Record<string, string>,
  delivery: RequestDelivery
) {
  if (variables.deliveryDigest !== deliveryVariables(delivery).deliveryDigest)
    throw new AppError({
      code: "CONFLICT",
      message:
        "The broker destination changed while this letter was being prepared. Regenerate it using the current contact method.",
    });
}

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
