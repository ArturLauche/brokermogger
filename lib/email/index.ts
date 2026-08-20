/**
 * Email provider factory.
 *
 * `getEmailProvider()` is the only way application code obtains a sender. The
 * instance is memoised per process because the adapters are stateless apart
 * from their SDK client. Selection follows `EMAIL_PROVIDER`, which
 * `lib/config/env.ts` already validated: `mock` is refused in production,
 * `resend` is refused in development, and `sandbox` requires a redirect inbox.
 */
import type { EmailProviderKind } from "@prisma/client";

import { env } from "@/lib/config/env";
import { createLogger } from "@/lib/observability/logger";

import { MockEmailProvider } from "./providers/mock";
import { ResendEmailProvider } from "./providers/resend";
import { SandboxEmailProvider } from "./providers/sandbox";
import type { EmailProvider } from "./types";

const log = createLogger("email");

let cached: EmailProvider | undefined;
let overridden = false;

function createProvider(): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case "resend":
      return new ResendEmailProvider();
    case "sandbox":
      return new SandboxEmailProvider();
    case "mock":
      return new MockEmailProvider();
    default: {
      // The env schema is an enum, so this branch only guards future values.
      const exhaustive: never = env.EMAIL_PROVIDER;
      throw new Error(`Unsupported EMAIL_PROVIDER: ${String(exhaustive)}`);
    }
  }
}

export function getEmailProvider(): EmailProvider {
  if (!cached) {
    cached = createProvider();
    if (!overridden) {
      log.debug({ provider: cached.kind }, "Email provider selected");
    }
  }
  return cached;
}

/** Test helper. Pass no argument to restore the configured provider. */
export function setEmailProviderForTests(provider?: EmailProvider): void {
  cached = provider;
  overridden = provider !== undefined;
}

export function emailProviderKind(): EmailProviderKind {
  return getEmailProvider().kind;
}

export { assertOutboundAllowed, isExternalPurpose } from "./guards";
export {
  buildBrokerRequestMessage,
  buildConsentInviteMessage,
  buildMagicLinkMessage,
  buildNotificationMessage,
  instanceFromAddress,
  instanceReplyToAddress,
} from "./messages";
// The ledger is intentionally not re-exported here: it touches the database,
// while this module stays importable from pure unit tests. Import it from
// `@/lib/email/ledger`.
export { clearMockOutbox, getMockOutbox, MockEmailProvider } from "./providers/mock";
export { ResendEmailProvider } from "./providers/resend";
export { SandboxEmailProvider } from "./providers/sandbox";
export {
  assertHeaderSafeRecord,
  assertSafeBody,
  formatRecipient,
  validateOutboundMessage,
  type ValidatedEmailMessage,
} from "./validate";
export type {
  BrokerRequestEmailInput,
  EmailAddress,
  EmailMessage,
  EmailProvider,
  MagicLinkEmailInput,
  NotificationEmailInput,
  SendResult,
} from "./types";
