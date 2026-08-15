# Working agreements for Brokermogger

Brokermogger is an open source privacy request desk. Users prepare, approve, send
and track privacy requests against data brokers. The product is free, self
hostable and must never behave like a black box.

## Non negotiable product rules

1. **No billing.** No subscription, payment, pricing, checkout or paywall code,
   tables, environment variables or copy. Limits exist only as operational fair
   use and are always explained in the UI.
2. **No guarantees.** Never claim guaranteed removal, never claim a legal right
   that the jurisdiction does not clearly provide. Uncertain legal logic is
   flagged with `requiresLegalReview` and carries a source URL, confidence and
   review date.
3. **Nothing leaves the instance without explicit user approval.** Broker
   contact requires an approved snapshot, a valid consent record, a sendable
   broker and `ALLOW_EXTERNAL_SENDING=true`.
4. **Data minimisation.** No date of birth, no government ID by default, no
   biometrics, no financial data, no children's data. Every collected field has
   a visible "Why we ask this" explanation.
5. **No scraping**, no CAPTCHA bypass, no login bypass, no terms violations. If
   automation is unsafe, create a manual task instead.

## Architecture rules

- Domain logic lives in `lib/**` and must not import from `app/**` or `next/*`.
  It has to be unit testable without a browser or a database where possible.
- Only `lib/db/**`, `workers/**`, `prisma/**` and tests may import
  `@/lib/db/client`. Everything else uses `lib/db/repositories/*`, which take an
  `ActorContext` and scope every query by ownership. ESLint enforces this.
- Only `lib/config/env.ts` reads `process.env`. Everything else imports `env`.
  ESLint enforces this.
- Authorization decisions come from `lib/permissions/policy.ts` (`can`,
  `requirePermission`). Never re-implement a permission check.
- Status changes come from `lib/requests/stateMachine.ts` (`assertTransition`).
  Never write `status` without going through it.
- Audit actions come from `lib/audit/actions.ts`. Never invent action strings.
- Errors are `AppError` subclasses from `lib/core/errors.ts` with a stable code.
- Logging uses `createLogger()` from `lib/observability/logger.ts`. Never
  `console.log`, never log personal data, use `safeMeta()` for structured fields.

## Security rules

- Personal identifiers are stored with `encryptField()` and, where lookups are
  needed, a `blindIndex()`. Masked previews come from `lib/security/masking.ts`.
- Anything that can reach an outbound message goes through
  `lib/security/sanitize.ts` first. No raw user input in email headers, no
  unescaped HTML, no CR/LF, no invisible unicode.
- Append-only tables (`AuditLog`, `RemovalRequestEvent`, `RequestSnapshot`,
  `ConsentRecord`) are protected by database triggers. Corrections are new rows.
- Every Zod schema validates at the boundary: server action input, route handler
  input, webhook payload, job payload.

## UI rules

- shadcn/ui components from `components/ui`. Tailwind v4 with CSS variables.
- Every screen needs empty, loading, error and success states.
- WCAG 2.2 AA: labelled inputs, `aria-describedby` error linkage, visible focus,
  status never communicated by colour alone, semantic headings, keyboard paths.
- Tone: calm, factual, no fear marketing, no urgency tricks, no emojis.
- Sensitive values are masked by default with an explicit reveal action.

## Commands

```bash
npm run dev              # Next.js dev server
npm run worker:dev       # background job worker
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run format           # prettier --write
npm run test             # unit + component tests
npm run test:integration # needs `docker compose up -d postgres-test`
npm run test:e2e         # Playwright
npm run db:migrate       # prisma migrate dev
npm run db:seed          # demo brokers, jurisdictions, legal rules, templates
```

Before finishing any change: `npm run typecheck`, `npm run lint`,
`npm run format`, and the tests for the area you touched.

## Environment

The dev container reaches Postgres and MinIO through the host alias `docker`
(see `.env`). On a normal workstation the same services are on `localhost`
(see `.env.example`). Never commit `.env`.
