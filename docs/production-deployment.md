# Production deployment

`docker-compose.prod.yml` builds three targets from `docker/Dockerfile`:

- `app`: Next.js standalone output, static assets and traced runtime modules.
- `worker`: production dependencies, generated Prisma client and job services.
- `migrate`: a separate pinned Prisma CLI with migrations and configuration.

All targets run as UID/GID 1001. The app contains no TypeScript, ESLint, Vitest,
Playwright or Prisma CLI. Development packages are excluded from the worker.
Compilation bypasses environment validation only during `next build`; the running
app and worker validate real configuration and reject example cryptography keys.

Copy `.env.example` to an uncommitted `.env`, replace every secret and configure
`APP_BASE_URL` and `AUTH_URL` for the actual HTTPS origin. Set `POSTGRES_PASSWORD`
and `DATABASE_URL` independently: the URL must use `postgres:5432` as its host
inside Compose and percent-encode reserved characters in credentials. Never pass
a workstation's `localhost` database URL into these containers.

`DATABASE_URL` still accepts the Prisma 6 pool settings. `?schema=` selects a
plain lowercase PostgreSQL schema for generated SQL **and** raw SQL; omitting it
uses `public`, while an empty, duplicated or quoted/mixed-case name fails at
startup. `?connection_limit=` maps to the pg pool size (default: 2 × available
parallelism + 1, following Prisma 6's CPU-derived default instead of a fixed 10). pg exposes one
acquisition timeout: `?pool_timeout=` takes precedence over `?connect_timeout=`
and defaults to 10 seconds (Prisma 6's pool timeout); it also bounds TCP
connection establishment. URL `?options=` values are preserved, but
`search_path` is rejected there because the schema parameter is authoritative.

Prisma 6 defaulted to `sslmode=prefer`, while pg defaults to plaintext when no
TLS setting is present. Production startup therefore requires an explicit
`sslmode` for non-loopback hosts. Use `sslmode=verify-full` (with
`sslrootcert` where a private CA is used) for external databases; for the
private Docker Compose network add `sslmode=disable` explicitly to
`DATABASE_URL`. Upgrade existing deployments by adding their intended
`sslmode` before restarting the app or worker.

Start with `ALLOW_EXTERNAL_SENDING=false`. Configure email delivery, verified
broker methods and consent separately; starting the instance does not authorize
broker contact. Use the [private-storage upgrade procedure](upgrade-private-storage.md)
when migrating an existing instance.

The app's published port is loopback-only (`127.0.0.1:3000:3000`), for a reverse
proxy on the Docker host. Existing installations must update any older
`3000:3000` bindings, including overrides, and recreate the app before trusting
headers. For a containerized proxy, remove publication and use a controlled
private network; follow the trust guide below for direct-routing/firewall checks.

Before a public multi-user deployment, run `npm run check:deployment`
with its actual environment and follow the [reverse-proxy trust boundary checks](authentication-abuse-controls.md#configuring-an-ingress).
Without trusted attribution every caller shares ten sign-in attempts per hour,
so one caller can deny login to the entire instance. Select a header only after
the ingress overwrites it and direct application access is blocked.
Production app and worker startup refuse disabled rate limiting or unconfigured
attribution. Only a private single-user instance should explicitly acknowledge
shared-bucket use with `ALLOW_SHARED_AUTH_NETWORK_BUCKET=true`; run its advisory
check with `npm run check:deployment -- --single-user`. Public configuration
checks remain strict even when that private-use acknowledgement is set.
The diagnostic command also works when full environment validation fails: it
prints a safe error and exits unsuccessfully instead of throwing before the
private-mode advisory. Check the required fields in `.env.example`; configured
values and exception messages are deliberately omitted from diagnostics.

Set `SECURITY_CONTACT_EMAIL` to a monitored operator address. Until configured,
`/.well-known/security.txt` returns 404 and no placeholder contact appears on the
sign-in error screen. Configured disclosure files use RFC 3339 expiry dates and
the runtime HTTPS canonical, following [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html#section-2.5.5).

```sh
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs --tail=100 migrate app worker
```

The migration container must exit successfully before app or worker starts.
The app readiness probe checks database connectivity at `/api/health/ready`.
The worker probe checks its own database heartbeat; its image configures
`WORKER_HEALTH_FILE=/tmp/brokermogger-worker-id`. See
[queue and audit monitoring](observability.md) for freshness and recovery semantics.
Keep both runtimes on the same commit and restart them together after upgrades.
The migration image is intentionally not an application server or worker.

Local encrypted objects live in the persistent `private-storage` volume mounted
at `/data/objects` in both runtimes. Docker initializes its ownership from the
image; a preexisting or bind-mounted directory must be writable by UID/GID 1001.
Back up this volume together with the database and retain the matching encryption
keyring separately. Mock delivery uses a separate `/data/mail` volume. Configure
S3 explicitly when using remote storage; preserve access to backends recorded on
existing objects until their migration and deletion work is complete.
Outside Compose, give app and worker the same absolute `STORAGE_LOCAL_DIR` and
`MOCK_EMAIL_DIR` paths. The standalone server changes its working directory;
relative paths can otherwise select different directories in the two processes.
Follow the [backup and restore procedure](backup-and-recovery.md) and rehearse it
on disposable infrastructure before relying on a backup.

## Disposable smoke test

`npm run test:docker` needs Docker Engine and Compose. It creates a uniquely named
isolated database, random test keys and private volumes. It applies migrations,
starts the production app and worker, uploads synthetic encrypted evidence,
generates a PDF report and masked and explicitly confirmed sensitive exports,
and checks authenticated downloads and production metadata/script protection.
External sending stays disabled. Its exit trap removes only its own containers
and volumes, and removes its temporary environment file. CI runs the same test.
Never substitute a real database or production volume into this fixture.
