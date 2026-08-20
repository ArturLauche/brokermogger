/**
 * Outbound sending guard.
 *
 * Nothing leaves the instance towards a data broker unless the operator has
 * explicitly enabled external sending. Magic links and account notifications
 * are always allowed because they go to the account holder's own address, and
 * in development the mock provider guarantees that they never leave the machine.
 */
import type { EmailPurpose } from "@prisma/client";

import { env } from "@/lib/config/env";
import { AppError } from "@/lib/core/errors";

/** Purposes that reach a third party and therefore need the operator switch. */
const EXTERNAL_PURPOSES: ReadonlySet<EmailPurpose> = new Set<EmailPurpose>([
  "BROKER_REQUEST",
  "BROKER_FOLLOW_UP",
]);

export function isExternalPurpose(purpose: EmailPurpose): boolean {
  return EXTERNAL_PURPOSES.has(purpose);
}

/**
 * Throws `EXTERNAL_SENDING_DISABLED` when a broker bound message is attempted
 * while `ALLOW_EXTERNAL_SENDING` is false. The message names both switches
 * because an operator almost always has to flip the provider as well.
 */
export function assertOutboundAllowed(purpose: EmailPurpose): void {
  if (!isExternalPurpose(purpose)) {
    return;
  }

  if (env.ALLOW_EXTERNAL_SENDING) {
    return;
  }

  // The mock adapter never leaves the machine. Development and tests must be
  // able to exercise the full approval-and-send path without a real provider.
  if (env.EMAIL_PROVIDER === "mock") {
    return;
  }

  throw new AppError({
    code: "EXTERNAL_SENDING_DISABLED",
    message:
      "External sending is switched off, so no message can be sent to a broker. " +
      "Set ALLOW_EXTERNAL_SENDING=true and configure a real EMAIL_PROVIDER " +
      "(sandbox or resend) before broker requests can leave this instance.",
    details: {
      purpose,
      allowExternalSending: env.ALLOW_EXTERNAL_SENDING,
      emailProvider: env.EMAIL_PROVIDER,
    },
  });
}
