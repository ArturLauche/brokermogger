# Brokermogger

Brokermogger is a free, open source privacy request desk. You prepare, review, approve, send and track privacy requests to data brokers. Nothing leaves the instance until you have read the exact text and confirmed it.

It is not a law firm. It does not guarantee removal. The shipped catalogue contains fictional examples and three inactive, sourced broker drafts. Real methods and coverage require operator verification; sending is disabled by default.

## What it does

1. You sign in with a magic link.
2. You save and resume a minimised profile, edit identifiers and obtain consent from any other adult whose requests you manage. No date of birth, government ID, biometrics or children's data is collected by default.
3. The instance selects an applicable published country/state pack. Unsupported statutory cases use clearly labelled voluntary requests; future unpublished laws never authorize present requests.
4. You choose brokers, generate and edit a letter, and review its exact text, recipient, channel and reply address.
5. You approve that immutable snapshot. Eligible email delivery still requires current consent and the instance's sending switches. Portal, platform and postal submissions remain explicit manual tasks.
6. You record submission and receipt, review correspondence, confirm its classification, and prepare reminders or an escalation summary when their prerequisites are met.
7. You receive in-app updates, generate complete reports, and download a masked export or explicitly confirmed sensitive copy. Optional notification email is opt-in. Account deletion blocks access immediately and queues resumable content/file cleanup.

Operators maintain verified broker contacts, versioned legal rules/templates and
fair-use settings. The console exposes job recovery, worker health and background
audit verification without revealing other accounts' private correspondence.

See [workflow and catalogue documentation](docs/operator-catalogue.md),
[correspondence](docs/correspondence.md), [exports](docs/account-exports.md),
[privacy and upgrades](docs/upgrade-private-storage.md), and
[interface](docs/interface-verification.md) and [performance verification](docs/performance.md).

## Requirements

- Node.js `^22.22.2 || ^24.15.0 || >=26.0.0` (`.nvmrc` pins 22.23.2)
- PostgreSQL 16
- An email provider for production (`resend` or `sandbox`). Development uses `mock`.

## Quick start

```bash
cp .env.example .env
# Generate secrets:
#   openssl rand -base64 32   # AUTH_SECRET, ENCRYPTION_KEYS material, BLIND_INDEX_KEY
docker compose up -d postgres postgres-test
npm ci
npx prisma generate
npm run db:migrate
npm run db:seed
npm run dev
```

In another terminal:

```bash
npm run worker
```

Open http://localhost:3000. Magic links are written to `MOCK_EMAIL_DIR` (default `.mail`).

If Postgres runs in Docker on a remote daemon, set `DATABASE_URL` to that host (for example `docker:5432`) instead of `localhost`.

## Commands

```bash
npm run dev              # Next.js
npm run worker           # PostgreSQL job worker
npm run typecheck
npm run lint
npm run format
npm run test             # unit + component
npm run test:integration # needs postgres-test on port 5433
npm run test:e2e
npm run db:migrate
npm run db:seed
npm run check:env
```

## Configuration

Every variable is documented in `.env.example` and validated in `lib/config/env.ts`.

Important switches:

- `ALLOW_EXTERNAL_SENDING` must be true before a real provider may send broker mail.
- `EMAIL_PROVIDER=mock` never leaves the machine. Local approval-and-send still works.
- Demo brokers have `productionSendingEnabled=false`. The database rejects production sending without verification.

## Docker

```bash
docker compose --profile app up -d --build
```

Production uses separate app, worker and migration images with shared encrypted
object storage. Configure real secrets, an HTTPS origin and a URL-encoded
`DATABASE_URL` using the `postgres` service hostname in your uncommitted `.env`.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

See [production configuration and disposable smoke tests](docs/production-deployment.md).
Images: `ghcr.io/arturlauche/brokermogger`, `brokermogger-worker` and
`brokermogger-migrate` under the same registry account.

## Continuous integration

GitHub Actions runs on every push to `main` and on pull requests. Node is installed from `.nvmrc`.

1. `npm ci --include=dev` (lockfile must match `package.json`; no `--legacy-peer-deps`)
2. Prisma generate + migrate against a Postgres 16 service on port 5433
3. Dependency auditing and `npm run check:env`, `typecheck`, `lint`, `format:check`, `test`, `test:integration`
4. Production build and Playwright (`npm run test:e2e`)

Browser fixtures preload the existing `tsx` loader for worker-side TypeScript
imports. The browser job uses shared local storage so its standalone server and
leased job handlers can read and purge the same encrypted objects.

CI also rehearses all three Docker runtimes, authenticated encrypted downloads,
database/object backup restoration and pending deletion recovery. No GitHub secrets
are required. The Docker workflow builds the images on pull requests and
`workflow_dispatch`, and pushes to GHCR only from `main` and `v*` tag pushes,
using `GITHUB_TOKEN`.

## Security

See [SECURITY.md](SECURITY.md), [docs/asvs.md](docs/asvs.md) and [docs/privacy-retention.md](docs/privacy-retention.md). Report vulnerabilities to the address in `SECURITY_CONTACT_EMAIL`.

## Licence

[AGPL-3.0-or-later](LICENSE).
