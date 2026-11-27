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

## AI agents and AI-assisted work

AI work is welcome, but it must be visible. Be honest about it — do not present
generated code as your own hand-written work.

- **Disclose the model.** Every pull request that was produced wholly or partly
  by an AI agent must state the **exact model slug** that wrote the code in the
  PR description, for example `Model: gpt-5.1-codex` or
  `Model: claude-sonnet-4.5`. The slug is the identifier the provider or harness
  actually reports, not a product name, a family name or a friendly label.
- **Name the agent, not just the model.** If a specific agent or harness ran the
  work (an IDE agent, a CLI agent, a review bot), say which one, plus its version
  if you know it.
- **State what it touched.** One line is enough: which files, areas or decisions
  the agent was responsible for.
- **One model per PR.** If several models contributed, list all of them with
  the scope each one covered. If the model changed mid-PR, note the switch.
- **Assume extra scrutiny.** The author of the PR stays responsible for every
  line: it has to follow `AGENTS.md`, pass the full check list above, and be
  reviewable by a human without guessing what the agent meant.
- **Never invent a slug.** If the exact model slug is unknown, write
  `Model: unknown` and explain why. A missing or fake disclosure is worse than
  an honest gap.

Example PR description header:

```text
Model: <provider/model-slug>
Agent: <tool or harness, version>
Scope: <what the agent changed>
Human review: yes/no
```
