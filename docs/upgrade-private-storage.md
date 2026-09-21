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
