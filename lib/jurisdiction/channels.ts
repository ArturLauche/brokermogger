import { RequestChannel } from "@prisma/client";
import { z } from "zod";

/** DROP is a distinct government workflow; ordinary letters cannot imply submission. */
export const ORDINARY_LEGAL_CHANNELS: readonly RequestChannel[] = [
  "EMAIL",
  "WEB_FORM",
  "POSTAL",
  "API",
];
export const legalChannelsSchema = z
  .array(z.enum(RequestChannel))
  .min(1)
  .max(Object.keys(RequestChannel).length)
  .refine(
    (channels) => new Set(channels).size === channels.length,
    "Choose each channel once."
  );

export function legalRuleChannels(verification: unknown): RequestChannel[] {
  if (
    !verification ||
    typeof verification !== "object" ||
    Array.isArray(verification) ||
    !("allowedChannels" in verification)
  )
    return [...ORDINARY_LEGAL_CHANNELS];
  const parsed = legalChannelsSchema.safeParse(verification.allowedChannels);
  return parsed.success ? parsed.data : [];
}

export function legalRuleAllowsChannel(verification: unknown, channel: RequestChannel) {
  return legalRuleChannels(verification).includes(channel);
}
