# Contributing

English for product UI, code and docs. Keep the tone calm and factual.

## Rules that patches must keep

- No billing, paywalls or paid-feature flags.
- No scraping, CAPTCHA bypass or login bypass.
- No children's data, date of birth, government ID or biometrics by default.
- Status changes go through `lib/requests/stateMachine.ts`.
- Authorization goes through `lib/permissions/policy.ts`.
- Prisma only from `lib/db/**`, workers, seeds and tests.
- `process.env` only from `lib/config/env.ts` and listed scripts.

## How to work

1. `npm ci`
2. `docker compose up -d postgres postgres-test`
3. `npm run db:migrate && npm run db:seed`
4. Make a small change.
5. `npm run typecheck && npm run lint && npm run format && npm run test`

`package.json` and `package-lock.json` must stay in sync. GitHub Actions runs `npm ci`, which fails if they drift (this is what took CI down when `lucide-react` was pinned to `0.31.0` while the lockfile expected `1.31.0`).

CI also runs `npm run check:env`, `npm run test:integration`, `npm run build` and `npm run test:e2e`. Integration tests need `postgres-test` on port 5433. The workflow needs no GitHub secrets.

UI screens must match `docs/ui-spec.md`.
