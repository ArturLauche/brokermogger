# Observability

## Logs

`createLogger()` from `lib/observability/logger.ts`. No `console.log` in application code. Do not log emails, tokens, raw identifiers or request bodies. Use `safeMeta()` for structured fields.

## Health

`GET /api/health` always returns HTTP 200 while the process is up. The JSON payload includes `database: ok | unreachable`.

`GET /api/health/ready` returns 503 when the database cannot be reached. App
readiness is separate from background processing availability.

Persistent workers register a random process identity and refresh their database
heartbeat every 15 seconds, including when idle or executing a long job. A worker
is recent for 60 seconds and records an explicit stop on graceful shutdown. No
hostname, IP address or user identity is stored. Old heartbeat rows expire after
seven days. Docker probes its own worker identity through `workers/health.ts`;
another healthy replica cannot conceal a stale process. External cron executions
are monitored by their scheduler and do not register as persistent workers.

## Metrics

`GET /api/metrics` is disabled unless `METRICS_TOKEN` is set. Send `Authorization: Bearer <token>`.

Gauges:

- `brokermogger_jobs_pending`
- `brokermogger_jobs_failed`
- `brokermogger_requests_open`
- `brokermogger_users_active`
- `brokermogger_jobs_due`
- `brokermogger_queue_oldest_due_seconds`
- `brokermogger_workers_active`
- `brokermogger_job_leases_expired`
- `brokermogger_delivery_ambiguous`
- `brokermogger_notification_delivery_ambiguous`
- `brokermogger_deletion_backlog`
- `brokermogger_deletion_oldest_seconds`
- `brokermogger_file_purge_backlog`

Queue age measures the oldest due pending/retryable job; future scheduled work
is excluded. A zero age with no due work is normal. Deletion remains pending until
both database content and stored objects have been erased. The admin jobs page
shows these counters without returning job payloads or private delivery content.
An ambiguous outcome requires reconciliation, not an assumption that retrying is
safe after the provider's idempotency window.

## Jobs

The worker polls PostgreSQL (`npm run worker`). External cron can call `POST /api/jobs/tick` with `Authorization: Bearer $CRON_SECRET`.

Failed jobs are visible in `/admin/jobs` (instance admin). Send handlers bind the
approved message to its outbound intent and fence worker publication. See the
[upgrade notes](upgrade-private-storage.md) for uncertain delivery recovery.

## Background audit verification

The worker checks the retained audit chain daily, and an instance admin can
request a fresh pass on `/admin/audit`. The page reads the last complete result
and its snapshot bounds; it never recomputes the entire chain during a page visit.
Repeated requests share one queued/running job. Operator authority is rechecked
under the account lock before scheduling.

Verification uses 250-row pages and constant-sized hash state in a read-only
Repeatable Read transaction. Appends and retention continue while the verifier
sees one consistent database snapshot. Current leases are checked outside that
snapshot, and result publication rechecks and locks the lease. A cancelled or
superseded worker cannot replace the last result. An interrupted attempt leaves
the previous complete result visible with its original completion time.

A retained-prefix anchor is explicitly shown; erased history is not reverified.
Retention removes only a contiguous prefix so out-of-order event timestamps
cannot create gaps. Complete check results follow the audit retention period.
These checks detect inconsistent retained content; an operator who controls the
database and all stored hashes can rewrite history. Use independently protected
backups or exported hashes when stronger tamper evidence is required.
