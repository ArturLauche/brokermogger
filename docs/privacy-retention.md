# Privacy and retention

Brokermogger stores the minimum needed to prepare and prove a privacy request.

## What is stored

- Login email encrypted at the application layer, with a blind index for Auth.js lookup
- Profile label, encrypted legal name/contact email, and confirmed country/region
- Encrypted identifiers with masked previews and blind indexes
- Immutable request snapshots with encrypted message content and approval envelopes
- Encrypted correspondence, private webhook content and optional evidence/artifacts
- Append-only consent proof and a hash-chained audit log without raw personal payloads

Not collected by default: date of birth, government ID, biometrics, financial data, children's data.

## Retention defaults

From `lib/config/systemSettings.ts`:

- Evidence: 24 months after close
- Temporary identity files: 30 days
- Closed requests: 24 months
- Audit log: 24 months
- Consent records: 72 months
- Job logs: 90 days
- Email metadata: 12 months
- Notifications: 12 months
- Generated account exports: 24 hours, enforced at download time

The worker jobs `PURGE_EVIDENCE`, `PURGE_TEMP_ID_FILES` and `RETENTION_SWEEP` apply these windows. Append-only tables need the session setting `brokermogger.allow_append_only_delete=on` inside that transaction. Instance settings show their current values; these defaults do not override an operator's configured policy.

Unfinished object purges and abandoned uploads are durable cleanup intents. A retention pass drains up to 2,000 unfinished objects in batches of 100, reports any remaining backlog and schedules a prompt continuation. Storage errors remain retryable and never count as completed deletion. A dry run includes unfinished intents without deleting objects.

## Export and deletion

`/settings/privacy` and `/api/account/export` provide a masked JSON export covering the account's record categories. `/settings/privacy/exports` also offers queued masked exports and an explicitly confirmed sensitive export. Stored copies are encrypted and expire after 24 hours. A downloaded sensitive copy contains unmasked personal data and is no longer protected by instance encryption. See [export contents and recovery](account-exports.md).

Profile and account deletion require typing `DELETE`. Account deletion commits access blocking, session revocation, cancellation of queued work, the deletion audit and the `DELETE_ACCOUNT_DATA` job together. If any mandatory write fails, none of those changes commit. An accepted broker email cannot be recalled.

Cleanup removes identifiers and blind indexes, profile identity, approved message copies, correspondence, private webhook content, notifications, reports, exports and stored objects. Completion is recorded only after all objects are gone. Failed deletion jobs can be retried by an operator; repeating a deletion request also rearms a terminal job without changing the original request date or stealing a live worker lease. Profile and identifier deletion erase affected personal copies and invalidate exports.

Minimal pseudonymous audit/consent proof and relationship tombstones remain for the disclosed periods. Cleanup does not erase operator-controlled backups or copies already submitted to a broker. Operators must apply their documented backup retention and restore procedure; see [backup and recovery](backup-and-recovery.md) and [private-storage upgrades](upgrade-private-storage.md).
