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

Damaged preparation payloads do not guess a reminder kind. The owner chooses a
follow-up or, where a previous follow-up was submitted, a final reminder. Repair
checks the job's owner, request, type and expected sequence before replacing the
payload and fencing any old worker. An unrelated job is never repurposed.

The deadline watcher persists its fixed scan window and last completed page under
the current lease. When a pass reaches its bounded work limit, it resumes after
one second instead of repeatedly starting at the oldest failing records. Failed
requests remain eligible in the next complete scan; completing or cancelling a
job with a stale lease cannot overwrite its saved progress.

After upgrading, previously stranded `NO_RESPONSE` requests can be picked up by
the next deadline watch. Active consent and the current follow-up cap still apply.
Run the app and worker from the same revision; stop old workers during an upgrade.

## Final reminders and escalation preparation

After a follow-up has a recorded manual submission or provider acceptance, the
request offers a final reminder. It consumes one of the configured reminder slots
and requires fresh approval. The preparation job records its kind, and publication
checks that kind along with the lease. Retry keeps the same kind. Editing or
regenerating a final reminder cannot silently turn it into an ordinary follow-up.
No further reminders are queued after a final reminder; an overdue result suggests
reviewing escalation guidance even when the instance's cap is higher.

New and regenerated reminders select the current active contact, preferring verified
contacts, then the operator's preference and priority. Archived contacts are excluded.
Changing from email to a portal changes the new approval envelope and requires the
manual submission flow. Previously submitted snapshots are preserved.

For a rejection, partial completion or overdue submitted request, the owner can
prepare an escalation summary from the request. This cancels pending reminders in
the same transaction as the recorded status change. Uncertain delivery must be
resolved first. The summary lists the historical source, recorded submission and
receipt information, confirmed classifications and available record counts. It
distinguishes simulated/sandbox email from real provider acceptance and warns that
acceptance does not establish receipt. It contains no identifier or correspondence
plaintext. Private download access requires the account holder, including when an
administrator has an emergency read grant.

The summary is a preparation aid, not a complaint. The person chooses the authority,
checks any appeal and filing requirements, writes their own explanation, selects
supporting records and makes any external submission themselves. The application
does not contact an authority. Authority acknowledgements can be added as evidence.

Rerun seeds after deploying the catalogue-history migration to receive revised letter
wording for household requests and partially answered follow-ups. Seed changes add
versions; approved historical snapshots are unaffected. Existing queued preparation
jobs without a kind continue as ordinary follow-ups.

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

New follow-up messages select the currently applicable rule for the request's
jurisdiction, type and actual channel. Publication is rechecked under its parent
lock before the snapshot commits. A replaced rule therefore has a recovery path:
review and approve the new message, while the original approved letter and its
response clock remain pinned to their original snapshot. Unavailable rules cannot
silently lend a different channel or statutory right to the reminder.
