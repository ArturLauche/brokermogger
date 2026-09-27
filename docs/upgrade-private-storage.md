# Upgrade private storage

This upgrade encrypts login email, magic-link lookup identities, request text,
provider webhook payloads, evidence and generated files. Existing snapshot IDs
and content hashes remain stable. The migration clears legacy plaintext columns
after verifying the replacement; their empty compatibility columns remain in
the schema during the upgrade window.

1. Schedule a maintenance window. Stop the app and worker. Keep
   `ALLOW_EXTERNAL_SENDING=false` until the upgrade and review are complete.
2. Take a consistent database and object-storage backup. Preserve every key ID
   in `ENCRYPTION_KEYS` and the original `BLIND_INDEX_KEY` separately and securely.
   Changing the blind-index key without a separate reindex migration breaks
   authentication lookup. Never use example or build keys in production.
3. Deploy the new code, run `npm run db:deploy`, then
   `npm run db:backfill-private` with the runtime environment loaded. The command
   reports counts without personal values. Run it again until every count is
   zero. It verifies each snapshot hash and file checksum before clearing the
   legacy representation. Batches are resumable.
4. Verify sign-in, an owned request preview and a file download using a test
   account. Review pending approvals before restoring any sending switches.
   Keep the app and worker on the same version throughout this procedure.

The approval-envelope migration cancels legacy queued sends. They cannot prove
approval of the recipient, channel, reply address and identifier set. Regenerate
these drafts and review them again; do not revive their old jobs. Historical
sent snapshots keep their IDs and content hashes. Legacy uncertain outbound
attempts are marked for reconciliation, never automatically replayed.

Every new worker claim uses a renewable lease token. Deploy app and workers
together; old workers cannot safely participate in the new lease protocol.
An uncertain Resend call may only replay the same immutable message within a
23-hour-55-minute safety window measured from its first dispatch. Thereafter it
requires checking provider records. This leaves five minutes before Resend’s
[documented 24-hour idempotency expiry](https://resend.com/docs/dashboard/emails/idempotency-keys).

The file backfill uses each record's original storage backend. Keep both old and
new backends available when changing storage settings. Missing objects, missing
keys or checksum failures stop the migration: restore the original resource and
rerun. Do not mark missing files successfully migrated. Local writes replace
objects atomically; a restart after the encrypted write is detected and verified
before its metadata is completed.

After plaintext has been cleared, rollback to older code requires restoring the
matching database **and** object backup; old code cannot read encrypted payloads.
Do not restore a backup over a running instance. Restored deletion requests must
be resumed before accounts or outbound workers are made available. Backups may
contain older personal data and remain subject to the operator's documented
retention and access policy.

Deletion blocks access and cancels queued work immediately. Cleanup is resumable
and remains pending when storage is unavailable. A deleted account retains only
pseudonymous parent records needed for audit and consent proof, with the
configured audit and consent retention periods (defaults: 24 and 72 months).
Personal identifiers, message payloads, files and their private metadata are
removed. The application cannot erase an operator's offline backups or recall
messages already accepted by an external provider.

## Household consent and editable profiles

Consent captured before profile-bound invitation scopes were introduced cannot
prove which identity and residency details were accepted. Those historical records
remain readable, but cannot authorize generation or dispatch. The household screen
shows **New invitation required**. Review the profile's real legal name, contact
email and residence, then send a fresh invitation and obtain fresh approval for
any queued request. No invitation is sent automatically during an upgrade.

Editing matching details now withdraws affected queued approvals. Regenerate the
letter to use the new fields, review it and approve the new immutable snapshot.
Messages already accepted by a provider cannot be recalled. Started or ambiguous
attempts remain in reconciliation instead of being silently retried.

## Correspondence upgrade

The correspondence migration assigns legacy replies to their request owner and
adds private receiving aliases, confirmation revisions and delivery-event links.
Run the private-payload backfill again: it encrypts legacy sender/preview/metadata
fields, verifies their replacements and minimises old delivery callbacks. A
preview is preserved as a preview, never represented as a complete reply.

Optional receiving configuration changes the reply address in newly generated
snapshots. Existing approvals must be regenerated and approved again before they
can use that address. Keep the original receiving domain available for replies to
historical messages. See [correspondence setup and recovery](correspondence.md).

## Notification preferences

The notification migration cancels unsent legacy email jobs and retains those
updates in the inbox. They have no proof of the new explicit email opt-in. Users
can enable reminders for future notifications in `/notifications#preferences`.
See [notification behavior and cancellation](notifications.md).

## Report generation

The report migration adds inclusive calendar boundaries, a captured timezone,
progress and fenced job/file publication. Historical files remain unchanged.
Restart app and worker together after migration. See [report generation and
recovery](reports.md) for date semantics, legacy jobs and file cleanup.

## Account exports

The account-export migration adds a separate queue record and 24-hour encrypted
artifact. It does not generate exports or enable sensitive access automatically.
Owners confirm sensitive copies explicitly; old approvals cannot be inferred.
The original masked endpoint now returns schema version 2 with all supported
record categories. See [export contents, exclusions and recovery](account-exports.md).
