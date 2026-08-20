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

UI screens must match `docs/ui-spec.md`.
