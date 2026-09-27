# Follow-up and dispatch recovery

A recorded response date is a tracking aid, not a promise that the broker will
respond. The deadline watcher commits the request's `NO_RESPONSE` event, scheduled
preparation, reminder and notification together. A failed enqueue rolls all of
those changes back. Preparation uses the recorded date plus the instance's reminder
interval; later reminders also respect the latest recorded submission.

Follow-ups are drafts. They require a new immutable snapshot and the account
holder's fresh approval. Preparing a draft never contacts a broker or an authority.
The configured cap limits how many follow-ups can be prepared. At the cap, the desk
suggests reviewing the history and escalation guidance rather than filing anything.

The worker rechecks the active account, profile consent and its current lease
before publishing a draft. An expired or cancelled lease cannot add a snapshot or
notification. Deadline warnings and recheck reminders use equivalent fences.
Concurrent preparation requests share one job. Failed or cancelled preparation
has an owner-visible retry on the request page; retry resets that job's attempts
while preserving its logs. Closing a request cancels pending work.

After upgrading, previously stranded `NO_RESPONSE` requests can be picked up by
the next deadline watch. Active consent and the current follow-up cap still apply.
Run the app and worker from the same revision; stop old workers during an upgrade.

## Blocked or uncertain sends

If a live consent, contact, approval or sending gate changes before dispatch, the
request moves to `NEEDS_USER_ACTION`. Its timeline explains the reason, its queued
send stops, and the inbox links to the next step. After resolving the cause, the
account holder must prepare and approve a fresh draft.

If a provider attempt already started, the desk preserves uncertainty. It does not
claim that the email was stopped or recalled. A worker that died during dispatch
also leaves an owner-visible reconciliation path. A running worker must finish or
lose its lease before the owner records a provider outcome. Reconciliation locks
the relevant jobs while checking and cancelling their retries, preventing a new
claim between the check and the confirmation.

Check provider records before confirming acceptance or non-acceptance. Accepted
email cannot be recalled. Provider acceptance does not prove delivery or removal.
