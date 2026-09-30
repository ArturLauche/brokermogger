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

Start with `ALLOW_EXTERNAL_SENDING=false`. Configure email delivery, verified
broker methods and consent separately; starting the instance does not authorize
broker contact. Use the [private-storage upgrade procedure](upgrade-private-storage.md)
when migrating an existing instance.

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
