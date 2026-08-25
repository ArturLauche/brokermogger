/**
 * Instance-wide broker sending throttles.
 *
 * These protect the sending domain and a single broker inbox. They are
 * operational fair use, not a paid feature. Limits come from runtime
 * system settings so an operator can tighten them without a deploy.
 */
import { getSetting } from "@/lib/config/runtimeSettings";
import { RateLimitError } from "@/lib/core/errors";
import {
  brokerSendPerBrokerHour,
  brokerSendPerDomainHour,
  consumePolicy,
} from "@/lib/rateLimit";
import { emailDomain } from "@/lib/security/sanitize";

export async function consumeBrokerSendThrottles(input: {
  brokerId: string;
  destination: string;
}): Promise<void> {
  const [domainLimit, brokerLimit] = await Promise.all([
    getSetting("fairUseSendsPerDestinationDomainPerHour"),
    getSetting("sendingMaxPerBrokerPerHour"),
  ]);

  const domain = emailDomain(input.destination);
  if (domain) {
    const byDomain = await consumePolicy(brokerSendPerDomainHour, domain, {
      limit: domainLimit,
    });
    if (!byDomain.allowed) {
      throw new RateLimitError(
        brokerSendPerDomainHour.description,
        byDomain.retryAfterSeconds
      );
    }
  }

  const byBroker = await consumePolicy(brokerSendPerBrokerHour, input.brokerId, {
    limit: brokerLimit,
  });
  if (!byBroker.allowed) {
    throw new RateLimitError(
      brokerSendPerBrokerHour.description,
      byBroker.retryAfterSeconds
    );
  }
}
