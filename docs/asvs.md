# Application Security Verification Standard (ASVS) mapping

This is a practical mapping for a self-hosted Next.js privacy desk, not a certification.

| ASVS area          | How Brokermogger addresses it                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| V1 architecture    | Domain logic in `lib/**`. Repositories take `ActorContext`. ESLint blocks raw Prisma and `process.env`.                 |
| V2 authentication  | Auth.js magic links, hashed request context, no passwords. Inactive accounts cannot keep a session.                     |
| V3 session         | Database sessions, revoke from account settings, secure cookie flags.                                                   |
| V4 access control  | `can()` / `requirePermission()`. Ownership on every user resource. Break-glass for admins, still no identifier decrypt. |
| V5 validation      | Zod at actions, webhooks, jobs, env. Template renderer rejects suspicious input.                                        |
| V6 cryptography    | AES-256-GCM envelopes, HMAC blind indexes, hash chains on audit/events/snapshots/consent.                               |
| V7 error handling  | `AppError` codes. Route errors do not leak internals. Structured logs via pino.                                         |
| V8 data protection | Masked previews, reveal audited, identity files temporary.                                                              |
| V9 communication   | CSP nonce in `proxy.ts`, security headers in `next.config.ts`.                                                          |
| V10 malicious code | No broker scraping. Outbound broker mail gated by approval + consent + sendable broker + operator switch.               |
| V11 business logic | State machine, fair use quotas, idempotent jobs, unique outbound email attempts.                                        |
| V12 files          | Type and size checks, authorised download route.                                                                        |
| V13 API            | Health, metrics (token), cron tick (secret), evidence download authorised.                                              |
| V14 config         | Zod env schema, `.env.example`, `npm run check:env`.                                                                    |

Residual risk: operators must verify broker contacts before production sending. Legal rules are published data, not legal advice.
