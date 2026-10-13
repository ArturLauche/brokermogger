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

## Verification of the original repair

- npm 10.9.4 clean `npm ci --include=dev` and separate
  `PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --omit=dev` both pass. The latter
  matches the production worker image's installation phase.
- Environment consistency, typecheck, lint, formatting and **493 unit/component
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
No test sent a real broker message. At that stage the repair targeted main
independently of #40. Merging requires a maintainer's authorization.

Completed CI exposed an existing browser-fixture timing race after all install,
audit, integration and build stages passed. The helper changed only priority and
attempted an immediate claim without ensuring the target's scheduled timestamp
was due on the database clock. CI found no eligible target, and subsequent retries
could claim the previous fixture's overdue job. Forcing a synthetic future target
reproduces this locally. The helper now makes that one job due using the database
clock before the same production claim/lease/handler path. The shared helper
requires the existing isolated mock environment and exactly one pending/retryable
target; reports, exports and erasure use it too. The correspondence fixture
deliberately delays its synthetic target so the contract is covered. Fresh browser
schemas isolate previous failed fixtures. No production scheduling, job
payload/state, lease fence or request approval rule is changed.

Browser global setup also seeds the existing jurisdiction, legal-rule and template
fixtures before pages warm catalogue caches. Previously a journey could cache an
empty catalogue before another journey seeded it, depending on test order and
cache expiry. This runs only under the isolated mock-environment guard; production
caching and legal content are unchanged.

The next automated review found that npm's production environment could omit
development advisories from the purported full scan. Explicit `--include=dev`
fixes that boundary. Both npm 10 scans reproduced the difference; the updated
gate still evaluates all nine development entries under `NODE_ENV=production`.
Report node/cause arrays now permit at most 100 unique entries each. Six new
regressions failed before these corrections and pass afterward. All 15 browser
journeys pass on fresh fixtures with retries disabled; CI retries and security
thresholds are unchanged.

The severity boundary also has explicit moderate/critical regrading regressions
for both the reported package and upstream advisory. Repository-wide source,
test and configuration searches confirmed no MSW imports or server/worker setup.
This dependency branch removes its unused direct declaration and script allowlist
entry with npm 10; optional Vitest peer metadata remains. Application behavior and
mock provider fixtures are unchanged.
The regenerated lock still retains MSW 2.15.0 through Vitest's optional peer
resolution. No install-size or advisory-count reduction is claimed; all retained
package versions are unchanged by this declaration cleanup.

CI at `8a3ee8b` passes all mandatory jobs and all 15 browser journeys without a
retry. The feature branch's matching journey exposed an additional action/fixture
race: a worker helper could run before the retry POST committed, while its job was
still failed. A controlled deferred POST reproduces the zero-row assertion. The
shared test now checks the pending state and waits for the scheduled UI before
driving the unchanged worker; final reminders wait for scheduling too. There is
no arbitrary sleep, production change or relaxation of job eligibility, fencing,
approval assertions or CI retries. Fresh exact-head CI is recorded in the PR.

## Additional PR review follow-up

The shared scanner now has a five-minute forced-termination budget, expiry-day
reporting and a scheduled security workflow. Tests prove timeout/partial-output
failure and warnings before the still-blocking expiry. Browser configuration
errors use the isolated-environment message without exposing malformed URLs;
five regressions failed before this correction. The correspondence journey
observes its delayed target before advancing it. A database regression proves
future jobs retain pending status, zero attempts and no lease until due.

These compatible audit/fixture changes are shared with #40 without importing
its application/proxy configuration or broadening this dependency repair into
an authentication feature. The refreshed 501 unit/component tests and focused
seven lease tests pass. Browser and new-head CI results are recorded in the PR.

## Integration after the quality improvements merge

After #40 merged into main, this branch was updated against `6514a93`. The
application changes now come from its base; this PR retains the compatible
development updates. The shared audit script has one manifest entry. Its lockfile
was regenerated with npm 10.9.4 from the security-updated main tree, preserving
the previously verified production and transitive security fixes.

The installed shadcn 4.21.1 tree includes `@shadcn/registry`, so the exact
development-only inventory contains nine affected entries for the same braces
advisory. The owner, severity, version, expiry and production/new-advisory
blocking rules are unchanged. A clean npm 10 install, the 42-variable environment
check, typecheck, lint, all 569 unit/component tests and both dependency gates
pass locally. Production audit reports zero findings. Complete combined
integration, build, browser and Docker results are recorded in the PR before
merging; earlier separate-branch results do not certify this updated tree.
