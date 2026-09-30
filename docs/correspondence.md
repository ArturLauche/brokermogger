# Correspondence and delivery receipts

Account holders can record a reply from a request's **Broker responses** tab.
Provide relevant text or an available evidence file. Text, sender, subject and
private provider metadata are encrypted with authentication bound to the response
record. Dates entered manually retain the account holder's calendar date.

Saving a reply does not change a request's status. The review screen offers a
local, conservative text-matching suggestion; the account holder confirms the
classification and separately chooses whether to apply an outcome. Completion
records what the broker reported, without guaranteeing removal. Applying an
outcome requires a submitted request, full reply text or available evidence, and
the current status/revision shown to the reviewer. It cancels queued sends and
follow-ups. A message already accepted by a provider cannot be recalled.

Replies render as concealed plain text until explicitly revealed. HTML is
converted on the server; scripts, embedded objects and remote images do not run.
The original sender is untrusted. Verify sender claims and instructions outside
the application. Identity uploads remain optional and require a confirmed
verification request, the corresponding current request state and explicit consent.

## Optional Resend receiving

Initial and follow-up letters use the reply address sealed in their encrypted
approval envelope. The owned receiving alias is prepared before rendering and
reused for that account; only a digest is added to snapshot variables. A changed
sender or reply configuration between rendering and persistence rejects the draft
without consuming quota. Text-only editing cannot silently adopt another reply
identity: regenerate and review a new snapshot. Historical messages remain intact.

Manual recording works without a receiving provider. To enable receiving:

1. Configure a receiving domain in Resend according to its
   [receiving guide](https://resend.com/docs/dashboard/receiving/introduction).
2. Set `RESEND_RECEIVING_DOMAIN`, `RESEND_API_KEY` and `RESEND_WEBHOOK_SECRET`.
   Configure the signed `email.received` webhook at `/api/webhooks/resend`.
3. Run the worker. Each account receives a random private alias when it prepares
   its next snapshot. This alias is part of the sealed approval envelope. A
   configuration change requires regeneration and fresh approval.

Resend's webhook contains metadata, not the complete reply. The worker retrieves
content separately from the fixed provider endpoint, as described in the
[content retrieval documentation](https://resend.com/docs/dashboard/receiving/get-email-content).
It checks the private recipient again after retrieval. Multiple account owners,
unknown aliases, inactive accounts and invalid signatures cannot import content.
Provider message IDs deduplicate receipts independently of webhook delivery IDs.

Only a unique, full 128-bit request reference within the owning account selects
a request. Short, missing, foreign or ambiguous references leave the reply in
**Correspondence → Unmatched** for account-holder assignment. Matching itself
does not change request status. Retrieval failures remain visible with a manual
import path. Replies larger than the bounded import limits (4 MiB response,
2 million HTML characters, 100,000 text characters) require manual recording or
redacted evidence. Attachments are never downloaded automatically.

## Recovery and privacy

Delivery callbacks persist only the provider message ID and event time needed to
update the ledger; recipient lists, subjects and provider diagnostics are omitted.
Callbacks arriving before the send receipt wait for reconciliation. Unmatched
events expire after 24 hours during processing or the retention sweep. An exhausted
retry becomes an operator-visible failed job. Supplying a verified provider ID
during delivery reconciliation requeues eligible unmatched events.

Ledger changes, lifecycle history and webhook completion commit together under
the current worker lease. A stale worker cannot apply them. A late delivered event
cannot undo a bounce or complaint. A callback for an earlier message does not
overwrite a newer draft's status.

Erasing a reply clears its sender, subject, body and private provider payloads.
An opaque deduplication marker remains to prevent redelivery from restoring it.
Separately uploaded evidence and request history have their own deletion paths.
Account deletion includes unmatched replies and private aliases; request/profile
erasure removes linked correspondence. Apply the storage upgrade backfill before
restarting upgraded workers. Legacy previews are explicitly labeled incomplete
and cannot alone justify a request outcome.
