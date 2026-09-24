import type { BrokerResponseClassification } from "@prisma/client";

/** Conservative suggestions only. No pattern changes a request's status. */
export function suggestClassification(text: string): BrokerResponseClassification {
  const lower = text.toLowerCase();
  if (
    /\b(verify your identity|identity verification|proof of identity|additional verification)\b/.test(
      lower
    )
  )
    return "VERIFICATION_REQUESTED";
  if (
    /\b(partially completed|partial removal|some of your (data|information))\b/.test(
      lower
    )
  )
    return "PARTIALLY_COMPLETED";
  if (
    /\b(cannot (delete|remove|process)|unable to (delete|remove|fulfi[ll]+)|request (was |is |has been )?(denied|rejected)|have not (deleted|removed))\b/.test(
      lower
    )
  )
    return "REJECTED";
  if (
    /\b(we have (deleted|removed)|your (data|information) has been (deleted|removed)|request has been completed)\b/.test(
      lower
    )
  )
    return "CONFIRMED_COMPLETED";
  if (
    /\b(we (have )?received your request|acknowledge receipt|request has been received|automatic reply)\b/.test(
      lower
    )
  )
    return "AUTO_ACKNOWLEDGEMENT";
  return "UNCLEAR";
}
