# Repair of the grouped development update

Original head: `39447997411b21a0538069f418769bb90c29f773`.
The October 8 [CI run](https://github.com/ArturLauche/brokermogger/actions/runs/37784751876)
failed at `npm ci`, before application verification. npm 10.9.4 reproduces the
manifest/lock disagreement around MSW 2 peer requirements when the grouped
manifest requests MSW 3. npm 11 accepting the tree is not proof that CI installs it.

The repair keeps the following compatible direct updates on this independent
branch, with a regenerated npm 10.9.4 lockfile:

| Package                     | Before | After  |
| --------------------------- | ------ | ------ |
| @playwright/test            | 1.62.1 | 1.63.0 |
| @testing-library/react      | 16.3.2 | 16.3.3 |
| @testing-library/user-event | 14.6.4 | 14.6.7 |
| jsdom                       | 30.0.1 | 30.1.2 |
| pino-pretty                 | 13.1.3 | 13.2.0 |
| prettier                    | 3.9.6  | 3.9.9  |
| shadcn                      | 4.18.0 | 4.21.1 |

TypeScript 7, Prisma 7, ESLint 10, MSW 3, Vitest 5 and Node 26 types are removed
from this group. Their existing supported versions remain; Prisma CLI/client
stay aligned at 6.19.3. Each migration needs its own compatibility implementation
and verification. No unverified migration PR is opened merely to move a version
number. The Vite React plugin remains 6.0.5 too: attempted 6.1.2 resolution under
npm 10 exposes an optional Babel 8 peer conflict, which deserves separate evaluation.
No force or legacy-peer flag is used. Regenerating from the valid main lockfile
also avoids npm 10's `edgesOut` resolver failure on the malformed grouped tree.

Both production advisories and all fixable development advisories are resolved
with the compatible transitive fixes documented in [dependency security](dependency-security.md).
The full audit still reports nine development-only package entries for the one
unpatched braces advisory. The exact exception, owner, November 11 expiry and
fail-closed tests are included here so this PR installs and verifies independently
of #40. Production audit has zero findings. Major frameworks, Node pins,
application code, database schema and broker sending gates are unchanged.

## Verification

- npm 10.9.4 clean `npm ci --include=dev` and separate
  `PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --omit=dev` both pass. The latter
  matches the production worker image's installation phase.
- Environment consistency, typecheck, lint, formatting and **485 unit/component
  tests** pass. Production compilation and standalone preparation pass.
- The unfiltered production audit passes; the full policy gate accepts only the
  documented unpatched development advisory.
- **15 Chromium journeys** pass using the updated Playwright/browser, synthetic
  fixtures, mock email and disabled broker sending. The first local attempt was
  stopped by the fixture database-name safety check; its configuration was
  corrected to a dedicated `_test` database without changing the guard.
- Production Docker smoke passes all three runtimes, encrypted/authenticated
  downloads, database/object restore and resumed account deletion on pinned Node 22.

The full integration result and exact-commit CI links are recorded in the PR.
No test sent a real broker message. This branch targets main directly and does
not depend on merging #40. Do not merge automatically.
