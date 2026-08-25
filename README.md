# Brokermogger

Brokermogger is a free, open source privacy request desk. You prepare, review, approve, send and track privacy requests to data brokers. Nothing leaves the instance until you have read the exact text and confirmed it.

It is not a law firm. It does not guarantee removal. The shipped broker directory is fictional demo data until an operator verifies it.

## What it does

1. You sign in with a magic link.
2. You create a minimised self profile (no date of birth, government ID, biometrics or children's data by default).
3. The instance maps your country and region onto a jurisdiction pack with published legal rules.
4. You choose brokers and generate drafts from a published template.
5. You approve the snapshot. Only then can a send job run.
6. You track status, attach evidence and download a report.

## Requirements

- Node.js 22.22.2 or later (`.nvmrc` pins 22.23.2)
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

Production-style:

```bash
export POSTGRES_PASSWORD=...
docker compose -f docker-compose.prod.yml up -d --build
```

Image registry: `ghcr.io/arturlauche/brokermogger`.

## Continuous integration

GitHub Actions runs on every push to `main` and on pull requests. Node is installed from `.nvmrc`.

1. `npm ci --include=dev` (lockfile must match `package.json`; no `--legacy-peer-deps`)
2. Prisma generate + migrate against a Postgres 16 service on port 5433
3. `npm run check:env`, `typecheck`, `lint`, `format:check`, `test`, `test:integration`
4. Production build and Playwright (`npm run test:e2e`)

No GitHub secrets are required for CI. The Docker workflow builds the image on pull requests and pushes to GHCR only from `main` and `v*` tags, using `GITHUB_TOKEN`.

## Security

See [SECURITY.md](SECURITY.md), [docs/asvs.md](docs/asvs.md) and [docs/privacy-retention.md](docs/privacy-retention.md). Report vulnerabilities to the address in `SECURITY_CONTACT_EMAIL`.

## Licence

[AGPL-3.0-or-later](LICENSE).
