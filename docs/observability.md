# Observability

## Logs

`createLogger()` from `lib/observability/logger.ts`. No `console.log` in application code. Do not log emails, tokens, raw identifiers or request bodies. Use `safeMeta()` for structured fields.

## Health

`GET /api/health` always returns HTTP 200 while the process is up. The JSON payload includes `database: ok | unreachable`.

## Metrics

`GET /api/metrics` is disabled unless `METRICS_TOKEN` is set. Send `Authorization: Bearer <token>`.

Gauges:

- `brokermogger_jobs_pending`
- `brokermogger_jobs_failed`
- `brokermogger_requests_open`
- `brokermogger_users_active`

## Jobs

The worker polls PostgreSQL (`npm run worker`). External cron can call `POST /api/jobs/tick` with `Authorization: Bearer $CRON_SECRET`.

Failed jobs are visible in `/admin/jobs` (instance admin). Send handlers are idempotent: the outbound email unique key prevents a second broker message.
