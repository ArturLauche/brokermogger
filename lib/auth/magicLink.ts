/**
 * Magic link delivery.
 *
 * Auth.js calls `sendMagicLinkVerificationRequest` once it has stored a
 * verification token. This module is the bridge to our own email layer: no
 * nodemailer, no direct provider call, everything goes through
 * `getEmailProvider()` so that the mock provider guarantee ("no real email in
 * development") also holds for sign in links.
 *
 * Two extra jobs happen here:
 *  - the rate limit is enforced when the request did not come through our own
 *    `/login` action, so the raw Auth.js endpoint cannot be used to flood an
 *    inbox,
 *  - the send is written to the outbound email ledger, so a user can see that a
 *    link was sent and delivery webhooks can be correlated later.
 */
import type { EmailProviderKind } from "@prisma/client";
import type { EmailProviderSendVerificationRequestParams } from "@auth/core/providers/email";

import { anonymousAuditActor, recordAudit } from "@/lib/audit/service";
import { AppError } from "@/lib/core/errors";
import { findAccountByEmail } from "@/lib/db/repositories/users";
import { getEmailProvider } from "@/lib/email";
import {
  recordQueuedEmail,
  recordSendFailure,
  recordSendResult,
} from "@/lib/email/ledger";
import { buildMagicLinkMessage, instanceFromAddress } from "@/lib/email/messages";
import type { MagicLinkEmailInput } from "@/lib/email/types";
import { createLogger } from "@/lib/observability/logger";
import { consumePolicy, magicLinkPerEmail } from "@/lib/rateLimit";
import { assertValidEmailAddress } from "@/lib/security/sanitize";

import { currentMagicLinkContext } from "./magicLinkContext";
import { emailIndexFor, readRequestContext } from "./requestContext";

const log = createLogger("auth.magic-link");

/**
 * Sends the sign in link. Throws on a hard failure so that Auth.js redirects to
 * `/login/error` instead of pretending the link is on its way.
 */
export async function sendMagicLinkVerificationRequest(
  params: EmailProviderSendVerificationRequestParams
): Promise<void> {
  const address = assertValidEmailAddress(params.identifier, "email");
  const context = currentMagicLinkContext();

  if (!context?.rateLimitConsumed) {
    await enforceDirectApiRateLimit(address);
  }

  const input: MagicLinkEmailInput = {
    to: { address },
    url: params.url,
    expiresAt: params.expires,
  };

  const account = await findAccountByEmail(address);
  const provider = getEmailProvider();
  const preview = buildMagicLinkMessage(input);

  const ledgerEntryId = await queueLedgerEntry({
    address,
    fromAddress: instanceFromAddress(),
    subject: preview.subject,
    body: preview.text,
    userId: account?.id ?? null,
    providerKind: provider.kind,
  });

  try {
    const result = await provider.sendMagicLinkEmail(input);

    if (ledgerEntryId) {
      await recordSendResult(ledgerEntryId, result).catch((error: unknown) => {
        log.warn({ err: error }, "Could not update the outbound email ledger");
      });
    }

    log.info(
      { provider: result.provider, dispatched: result.dispatched },
      "Magic link handed to the email provider"
    );
  } catch (error) {
    if (ledgerEntryId) {
      await recordSendFailure(
        ledgerEntryId,
        error instanceof AppError ? error.code : "send_failed"
      ).catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Defence in depth for `POST /api/auth/signin/magic-link`. Our own login action
 * consumes the limit before it calls Auth.js, so this path only runs when the
 * endpoint was called directly.
 */
async function enforceDirectApiRateLimit(address: string): Promise<void> {
  const decision = await consumePolicy(magicLinkPerEmail, address);
  const requestContext = await readRequestContext();
  const actor = anonymousAuditActor(requestContext.requestId, {
    ipHash: requestContext.ipHash,
    userAgentHash: requestContext.userAgentHash,
    emailIndex: emailIndexFor(address),
  });

  if (decision.allowed) {
    await recordAudit({
      actor,
      action: "auth.magic_link.requested",
      resourceType: "user",
      metadata: { entryPoint: "auth_api", emailIndex: emailIndexFor(address) },
    });
    return;
  }

  await recordAudit({
    actor,
    action: "auth.magic_link.rate_limited",
    resourceType: "user",
    outcome: "DENIED",
    reason: "Too many sign in links were requested for this address.",
    metadata: {
      entryPoint: "auth_api",
      limit: decision.limit,
      retryAfterSeconds: decision.retryAfterSeconds,
    },
  });

  throw new AppError({
    code: "RATE_LIMITED",
    message: magicLinkPerEmail.description,
    details: { retryAfterSeconds: decision.retryAfterSeconds },
  });
}

/**
 * The ledger is useful but must never block a sign in. A failure is logged and
 * the send continues without a ledger row.
 */
async function queueLedgerEntry(input: {
  address: string;
  fromAddress: string;
  subject: string;
  body: string;
  userId: string | null;
  providerKind: EmailProviderKind;
}): Promise<string | null> {
  try {
    const entry = await recordQueuedEmail({
      purpose: "MAGIC_LINK",
      provider: input.providerKind,
      toAddress: input.address,
      subject: input.subject,
      body: input.body,
      fromAddress: input.fromAddress,
      userId: input.userId,
      metadata: { channel: "magic_link" },
    });
    return entry.id;
  } catch (error) {
    log.warn({ err: error }, "Could not write the outbound email ledger entry");
    return null;
  }
}
