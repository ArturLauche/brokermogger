# Email deliverability

This document describes how a Brokermogger instance sends email, what an
operator has to configure before the first broker request leaves the machine,
and which limits are enforced in code. It is written for the person who runs the
instance, not for the person who wrote it.

Brokermogger sends very little mail, but what it sends matters: a data broker
that classifies a deletion request as spam will not act on it, and a sending
domain with a damaged reputation makes every future request from that instance
weaker. Deliverability is therefore treated as a correctness requirement.

## The two switches

No broker email can leave the instance unless **both** of these are true:

| Switch                     | Where                             | Meaning                                          |
| -------------------------- | --------------------------------- | ------------------------------------------------ |
| `ALLOW_EXTERNAL_SENDING`   | environment (`lib/config/env.ts`) | The operator allows outbound mail at all.        |
| `sending.enabled_by_admin` | system settings, admin console    | An instance admin confirmed the setup in the UI. |

`assertOutboundAllowed(purpose)` in `lib/email/guards.ts` enforces the first
switch for `BROKER_REQUEST` and `BROKER_FOLLOW_UP` and throws
`EXTERNAL_SENDING_DISABLED` when it is off. Sign in links, notifications and
account security mail are always allowed, because in development they are handled
by the mock provider and never reach the network.

Recommended progression for a new instance:

1. `EMAIL_PROVIDER=mock` - nothing leaves the machine, messages are written as
   `.eml` files into `MOCK_EMAIL_DIR`.
2. `EMAIL_PROVIDER=sandbox` - real Resend delivery, but every recipient is
   replaced by `EMAIL_SANDBOX_REDIRECT_TO`, the subject is prefixed with
   `[sandbox]` and the masked original recipient is kept in the
   `X-Brokermogger-Original-To` header.
3. `EMAIL_PROVIDER=resend` with `ALLOW_EXTERNAL_SENDING=true` and the admin
   switch enabled - only after the domain checks below pass.

## Domain verification

Use a dedicated domain or subdomain for Brokermogger, for example
`privacy.example.org`. Do not send from the domain that carries your normal
business mail: a bounce storm on a broker inbox must not touch your primary
reputation.

Steps:

1. Add the domain in the Resend dashboard and publish the DNS records it shows.
2. Wait until the domain shows as verified. Resend refuses to send from an
   unverified domain, and the SDK error surfaces as `EMAIL_FAILED`.
3. Set `EMAIL_FROM` to an address on that domain, for example
   `Brokermogger <requests@privacy.example.org>`. The display name is validated
   through `sanitiseHeaderValue`, so it can never inject a header.
4. Send one message to a mailbox you control and inspect the headers. DKIM,
   SPF and DMARC must all show as `pass`.

## DKIM

Publish the DKIM key Resend generates, usually as a `CNAME` or `TXT` record on a
selector such as `resend._domainkey.privacy.example.org`. DKIM is the signature
that survives forwarding, so it is the record brokers are most likely to check.

- Use a 2048 bit key when the provider offers a choice.
- Rotate the key if it is ever exposed. Publish the new selector, wait for
  propagation, then remove the old record.
- Never sign from a domain you do not control. A mismatch between the `From`
  domain and the DKIM domain (`d=`) breaks DMARC alignment.

## SPF

Publish exactly one SPF record on the sending domain and include the provider:

```
privacy.example.org.  TXT  "v=spf1 include:amazonses.com -all"
```

Follow the include value from your provider's dashboard rather than copying the
example. Rules:

- One `v=spf1` record per domain. Two records are a permanent error.
- Stay within the ten DNS lookup limit; each `include` counts.
- End with `-all` (hard fail). `~all` invites spoofing of your privacy domain.

SPF alone is not enough, because it breaks on forwarding. It exists here to make
DMARC alignment possible through two independent paths.

## DMARC

Publish a DMARC policy on the sending domain:

```
_dmarc.privacy.example.org.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@example.org; fo=1; adkim=s; aspf=s"
```

Start with `p=none` and read the aggregate reports for two weeks. When every
legitimate stream passes, tighten to `p=quarantine` and then `p=reject`. Strict
alignment (`adkim=s`, `aspf=s`) is appropriate because there is exactly one
sending path.

A broker that receives a deletion request from a domain with `p=reject` and
aligned DKIM has no technical excuse to treat the message as unverifiable.

## Reply-to strategy

Broker correspondence must be readable by a human, so replies have to arrive
somewhere that a person actually reads.

- `EMAIL_FROM` is the instance identity and stays constant.
- `EMAIL_REPLY_TO` is the operator mailbox for the instance. It is set on every
  message by the Resend provider (`reply_to`).
- For a single user instance, `EMAIL_REPLY_TO` can be the account holder's own
  address. For a multi user instance, use an operator mailbox and forward, or use
  the profile's contact address once the request slice sets a per profile
  reply-to. A broker that answers must never end up talking to `no-reply`.
- Never put a `Reply-To` address on a domain that fails DMARC; some receivers
  score that as a phishing signal.
- Sign in links are transactional and deliberately carry no reply-to beyond the
  instance default. Nobody should reply to a sign in link.

## Bounce handling

Resend delivers `email.bounced` events to
`POST /api/webhooks/resend`. The route verifies the Svix signature with
`RESEND_WEBHOOK_SECRET`, stores an `EmailWebhookEvent` row and returns 202. The
background worker processes the event later and updates the `OutboundEmail`
ledger (`bouncedAt`, `status`).

Operator rules:

- A **hard bounce** (unknown mailbox, domain does not exist) means the broker
  contact data is wrong. Mark the broker contact for review instead of retrying.
  Retrying a hard bounce is the fastest way to a blocklist.
- A **soft bounce** (mailbox full, temporary failure) may be retried with
  exponential backoff, at most twice, and never faster than the follow up
  schedule.
- Keep the bounce rate under 2 percent measured over the last 1000 messages. Above
  that, stop sending and fix the broker directory before continuing.
- The bounce reason is stored short and free of personal data in
  `OutboundEmail.lastError`. It is never shown as a raw provider blob to the user.

## Complaint handling

A complaint (`email.complained`, a spam button press) is more damaging than a
bounce and is treated as a stop signal.

- The worker records `complainedAt` on the ledger row and disables further
  automatic sending to that recipient address.
- A broker contact that produces a complaint is flagged for manual review with
  `manualReviewRequired`. Escalation for that broker continues through a
  different channel: a web form, postal mail or the supervisory authority.
- Keep the complaint rate under 0.1 percent. One complaint per thousand messages
  is already a warning sign at this volume.
- Never remove a suppression automatically. An operator has to decide.

## Per broker limits

- `sending.max_per_broker_per_hour` (default 10) is the instance wide throttle
  for one broker, exposed as the `brokerSendPerBrokerHour` policy.
- `fair_use.requests_per_broker_per_30_days` (default 5) limits how often one
  account may contact the same broker, exposed as `requestCreatePerBroker30Days`.
- Follow ups are additionally bounded by `follow_up.max_attempts` (default 2)
  and `follow_up.first_reminder_days` (default 7). A broker never receives a
  third reminder from this instance.

The point is that a broker's privacy inbox is staffed by people. Ten messages an
hour is a queue they can work through; a thousand is an incident they will
escalate to their abuse desk.

## Per user limits

- `fair_use.requests_per_day` (default 25) and
  `fair_use.requests_per_month` (default 200), exposed as
  `requestCreatePerUserDay` and `requestCreatePerUserMonth`.
- `fair_use.account_age_hours_for_bulk` (default 24) delays bulk creation for
  brand new accounts.
- Sign in links: three per address per 15 minutes (`magicLinkPerEmail`, mirrors
  `UserQuota.magicLinksPer15Minutes`) and ten per network per hour
  (`magicLinkPerIp`).

Every limit is fair use protection for the instance and its sending domain. None
of them is a paywall, and each one is explained in plain language in the UI
through `RateLimitPolicy.description`.

## Per destination domain limits

- `fair_use.sends_per_destination_domain_per_hour` (default 30), exposed as
  `brokerSendPerDomainHour`.
- The key is the recipient domain hashed with `hashContextValue`, so the
  `RateLimitBucket` table never stores a raw domain, address or IP.
- Large brokers share mail infrastructure. Throttling per destination domain
  protects the instance against a single receiver deciding that this sending
  domain is a source of bulk mail.

## No bulk sending without throttling

This is a hard rule, not a recommendation:

1. Outbound broker mail is queued through jobs and released by the worker at the
   configured rate. Nothing in the product sends a batch in a tight loop.
2. Every send passes through the rate limit policies above. A send that would
   exceed a limit is delayed, never dropped silently and never forced through.
3. There is no "send to all brokers now" action. A user with 200 pending requests
   sees them released over time, and the UI says so.
4. Retries use backoff and the ledger's `(removalRequestId, purpose, attempt)`
   uniqueness, so a crash cannot turn into a duplicate storm.
5. Sending to a broker contact address that was never verified requires manual
   review first.

If you need to send more than the defaults allow, raise the limits deliberately
in the admin console, watch the bounce and complaint rates, and be ready to lower
them again. Do not bypass the throttle in code.

## Monitoring checklist

Check these weekly while an instance sends in production:

- Bounce rate and complaint rate over the last 1000 messages.
- `OutboundEmail` rows stuck in `QUEUED` (worker not running) or `FAILED`
  (provider or configuration problem).
- `EmailWebhookEvent` rows with `processedAt IS NULL` older than an hour.
- DMARC aggregate reports for authentication failures on your own streams.
- Whether `sending.enabled_by_admin` is still supposed to be on.
