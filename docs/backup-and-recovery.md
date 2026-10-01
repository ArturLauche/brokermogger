# Backup and recovery

A usable backup contains the database, every storage backend still referenced by
private objects, and the matching encryption keyring. Keep the keyring and blind
index key in a separately protected secret backup. Ciphertext is not a substitute
for storage access controls or a retention policy. An unavailable historic key
prevents recovery; a changed blind-index key breaks account lookup.

## Consistent backup

Schedule a maintenance window and stop app and worker writers together. For the
provided production Compose stack, take a PostgreSQL custom-format dump and a
local object archive while both are stopped:

```sh
umask 077
backup_directory=$(mktemp -d ./brokermogger-backup.XXXXXX)
docker compose -f docker-compose.prod.yml stop app worker
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U brokermogger -d brokermogger --format=custom --no-owner --no-privileges \
  > "$backup_directory/database.dump"
docker compose -f docker-compose.prod.yml run --rm -T --no-deps worker \
  tar -C /data/objects -cf - . > "$backup_directory/objects.tar"
```

Use provider-supported snapshot/versioning procedures for S3 and record the
matching recovery point. Record the commit/image digest, migration state,
storage-backend configuration, backup checksums and key IDs with the backup.
Do not store clear keys alongside these archives or commit any backup to Git.
Restrict backup access and test recovery before relying on it. Restart both
runtimes together once backup integrity is verified.

## Restore rehearsal

Restore first into an isolated database and private object volume. Use staging
configuration, mock delivery and `ALLOW_EXTERNAL_SENDING=false`. Keep public
access and workers stopped during restoration. Use `pg_restore --exit-on-error`
against an empty database; restore objects with UID/GID 1001 access, and supply
the original keyring and blind-index key. Verify archive checksums before use.
Apply `npm run db:deploy`, run any required resumable private-payload backfill,
and keep app and worker on the same version.

Verify owned sign-in, profile data, a historical approved snapshot, evidence,
report and export downloads, plus ciphertext checks. Rerunning migration must
report no pending changes. Check the queue and audit pages, resume pending
erasure, and confirm its database content and stored objects are removed. An
uncertain provider outcome must be reconciled against provider records; restoring
an old outbound intent does not make it safe to send again. Renewed approval is
required when the complete message envelope cannot be proven.

`npm run test:docker` rehearses this with synthetic data: it stops both writers,
backs up the disposable database and encrypted objects, restores them to a second
disposable database, reapplies migrations, restores the object archive after
removing the fixture files, and verifies authenticated downloads. A deletion
queued before the backup must resume and erase its private object after restore.
It uses a unique Compose project and cleans up only that project's resources.

## Actual recovery and rollback boundaries

Never overwrite a running database or its storage. Validate the isolated restore
before switching traffic. Keep external sending disabled until consent, current
broker eligibility, approval versions and ambiguous attempts are reviewed.
Confirm worker heartbeat and queue age after starting the restored worker.

Backups can predate a deletion. Preserve a separately protected minimal deletion
checkpoint and reconcile later deletion requests before reopening account access
or outbound work. A backup taken before a request cannot infer that later event.
An operator must apply those requests to the restored copy and retire superseded
backups under the disclosed policy. The app cannot erase offline backups or recall
messages already accepted by an external provider.

After encrypted backfill clears legacy plaintext, older application versions
cannot read the new payloads. Rollback requires the matching database, objects,
keys and application version as one recovery point. The fenced job protocol and
new job types also require app and worker to be upgraded or restored together.
Missing objects, hashes, key IDs or backend access are failures to investigate,
never reasons to report a successful restore or purge.
