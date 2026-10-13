# Verification of the October 2026 change

The first table records the original PR verification. The owner-review follow-up
below supersedes its dependency blocker and adds mandatory audit rollback tests.

Base: `2a030780539d998dc93220e189512ca0bce80453` (`main`, fetched again before
committing). Local runtime: Node 24.21.0 / npm 11.19.0. Docker exercised the pinned
Node 22.23.2 images. All fixtures were synthetic, email was mock and external
broker sending was disabled. This workspace had no `.env`; isolated environment
values were supplied only to command processes. PostgreSQL used `docker:5433`.
Browser storage and worker fixtures shared an absolute local directory and their
own `bm_e2e_quality` test schema.

| Command                                     | Result                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm ci --include=dev`                      | Passed on main manifests; a separate clean npm 10.9.4 install also passed.                                           |
| `npm run check:env`                         | Passed, 41 variables.                                                                                                |
| `npm run typecheck`                         | Passed.                                                                                                              |
| `npm run lint`                              | Passed.                                                                                                              |
| `npm run format` and `npm run format:check` | Passed; no unrelated formatting changes retained.                                                                    |
| `npm run test`                              | 503 tests in 76 files passed.                                                                                        |
| `npm run test:integration`                  | 307 tests in 48 files passed in a fresh sequential run.                                                              |
| `npm run build`                             | Passed with the documented isolated build configuration.                                                             |
| `npm run test:e2e`                          | 17 Chromium journeys passed; desktop/mobile readiness, keyboard paths and WCAG-tagged Axe checks included.           |
| `bash scripts/docker-smoke.sh`              | Passed, including three runtimes, encrypted/private downloads, database/object restore and resumed pending deletion. |
| `npm run benchmark:database -- artifacts`   | Passed; complete JSON/PDF generation, encrypted publication/download, zero outbound email.                           |
| `npm audit --audit-level=moderate`          | Inherited dependency findings remain a CI blocker; the feature PR is a draft.                                        |

The browser suite caught and verified fixes for differing first-leg redirect
origins and readiness text changing checkbox names. The email-limited direct
attempt also consumes a network attempt, as before; the combined form/API fixture
therefore observed nine emitted links from sixteen counted attempts in one fixed
window, without exempting rejected email attempts. The later rollover correction
aggregates every network window and compares issuance with committed admission
proofs, so a boundary crossing cannot choose an arbitrary bucket or assume a
single window's emission count.

The full integration suite covers existing ownership/approval isolation,
transaction failure, worker fencing/retries, duplicate webhooks, deletion,
encryption, exports, legal versions and manual submission. New regressions cover
raw HTTP access, concurrent requests, changing addresses/forwarding headers,
known/unknown addresses, shared form/API counting, CSRF, untrusted callback
origins, JSON replies, suppressed/failed counter writes and complete export page
boundaries. These are evidence of the exercised scenarios, not an exhaustive
security guarantee.

Screenshots below use the isolated instance and synthetic operator. Real broker
drafts remain inactive and sending disabled.

- [Public directory before](brokers-before.png), [desktop](brokers-desktop.png), [mobile](brokers-mobile.png).
- [Operator list before](admin-brokers-before.png), [readiness on desktop](admin-readiness-desktop.png), [mobile](admin-readiness-mobile.png).
- [Legal review queue on desktop](legal-review-desktop.png), [mobile](legal-review-mobile.png).

The manual design detector reported no findings. Viewports were 1440 and 375 CSS
pixels. The long legal review filter keeps the mobile search field usable; the
browser regression requires at least 240 pixels of search width at 375 pixels.

## Owner-review follow-up

Installation used **npm 10.9.4** on local Node 24.21.0; Docker smoke used the pinned
Node 22.23.2 runtimes. Dedicated databases keep the feature suite, failure
injection and the separately repaired #39 from resetting each other's fixtures.

- Two new audit failure-injection tests failed on the original implementation:
  both explicit SQL failure and a trigger silently suppressing insertion left
  committed counters. They pass after mandatory proof and counters share one
  transaction. Suppressed Prisma `create()` responses cause the existing Prisma
  6 engine to emit a panic diagnostic; the test deliberately injects that failure
  and proves rollback and fail-closed admission, followed by successful recovery.
- The latest focused authentication/counter/audit-chain run passes **38 tests**,
  including an appender returning null, both rejected and suppressed counter
  writes, existing-counter rollback on quota rejection, same-request failed
  single-flight checks, fresh-request recovery and mixed concurrent audit writers.
- **518 unit/component tests** pass. Typecheck, lint, formatting, environment
  consistency, production build and all **17 browser journeys** pass. Production
  Docker smoke passes encrypted downloads, storage/DB restore and resumed erasure.
- The unfiltered production audit passes with **zero findings**. The full
  `npm run audit:dependencies` gate passes with the documented braces-only,
  development-only exception expiring **November 11**. The raw full audit still
  reports eight high dependent package entries; it is not reported as clean.
- The explicit public preflight exits with failure for unknown network attribution
  and prints the instance-wide login-denial warning. The default check preserves
  local/single-user use; configured ingress still requires a real network check.

The real browser also rechecked the generic confirmation and shared-network
explanation at [1440 pixels](review-check-email-desktop.png) and
[375 pixels](review-check-email-mobile.png); the mobile document has no horizontal
overflow. The operator deployment warning and ingress checklist are documented
without introducing a public IP diagnostic or any quota exemption.

Full integration and exact-commit CI results are recorded in the PR review reply.
The PR stays draft until all required checks pass; the local passes do not stand
in for a completed GitHub verify job.

The first review-fix CI run exposed a fixture error: auth integration assertions
hardcoded `localhost`, while CI configures `APP_BASE_URL` as `127.0.0.1`. All twelve
failures were exact-origin mismatches; the other 306 integration tests passed.
The failure reproduces locally under CI's URL settings. Assertions now derive the
expected canonical from validated configuration, while hostile request-host tests
and exact redirect/JSON equality checks remain. Both loopback configurations are
verified explicitly; no application policy or CI setting is changed for this fix.

#39's completed CI then exposed an existing correspondence-fixture race: the
browser helper changed only priority and immediately tried to claim the scheduled
target, without ensuring its timestamp was due on the database clock. CI returned no target
job; retries could pick the previous fixture's now-due job. Forcing a synthetic
target into the future reproduced the claim failure locally. A shared guarded
browser helper now makes the specified preparation, report, export or erasure job
due before using the unchanged claim/lease/handler path. It requires isolated mock
fixtures, updates exactly one pending/retryable row and leaves payload, state and
fencing intact. The correspondence journey deliberately delays its synthetic
preparation to exercise this contract. Fresh browser schemas exclude old failed
fixture jobs. No production schedule or approval gate changes.

Fresh runs also exposed fixture ordering: a page could cache an empty legal
catalogue before a later journey seeded reference data, leaving draft generation
disabled until the normal cache expired. Browser global setup now prepares the
existing jurisdiction, legal-rule and template fixtures before pages run, guarded
by the same isolated mock-environment checks. Production caching and legal content
are unchanged.

Additional automated review found two audit-tool boundary issues and contended
authentication locks. The full scan now explicitly includes development
dependencies under `NODE_ENV=production`; node/cause arrays are bounded and
deduplicated. Six new unit regressions failed before the changes and pass after;
real npm 10 production-environment scans confirm the omission and its correction.
The new audit-chain and network-lock contention regressions took seven seconds
before the fix despite Prisma's default deadline. Transaction-local PostgreSQL
lock/statement limits plus explicit Prisma budgets now bound admission, prove
complete rollback and permit a fresh request after release. Both regressions
pass alongside mixed concurrent writers, failure injection and generic replies.
Neither lock failures nor audit exceptions enable token issuance without proof.
Fresh browser fixtures pass all 17 feature journeys and all 15 #39 journeys with
retries disabled. CI's retry configuration is unchanged.

The latest feature unit/component run passes **526 tests in 79 files**, including
moderate/critical regrading of the excepted finding and its advisory. The expanded
authentication/audit-focused run passes **39 tests**; the full integration result
is recorded in the PR. Rebuilt standalone browser verification passes **17
journeys without retries**, and the rebuilt production Docker smoke passes private
downloads, encrypted shared storage, backup restoration and resumed erasure.

CI at `5494490` completed every required job but needed one correspondence retry;
`8a3ee8b` completed all 15 dependency-branch browser journeys on the first attempt.
The feature failure was an action/fixture race: after clicking retry, the helper
could read the still-failed job before the server action committed. Holding the
retry POST reproduced the same zero-row guarded update deterministically. The
journey now checks the disabled pending button, releases the POST, and waits for
the scheduled heading before driving the worker. Final-reminder scheduling uses
the same UI completion boundary. The regression uses no arbitrary sleep and
retains strict job eligibility, lease fencing and approval assertions. This test
correction is shared by both branches; production code and CI retry policy stay
unchanged. The PR records fresh exact-head verification before readiness.

## Additional twelve-finding review

The production/development Compose defaults now publish the app on loopback.
Docker smoke parses all three shipped files (with the development app profile
enabled and without resolving secrets), then verifies production build/runtime,
encrypted downloads, database/object restore and resumed erasure. This completed
locally with Docker 29.7.1 on the configured Docker host; it does not attest to an
operator's firewall or alternate ingress. The trust guide documents existing
container recreation, private proxy networks, direct routing and older Docker
loopback limitations.

Failing-before evidence includes **19 unit regressions** for deployment/default
checks, malformed counter-port results, scanner deadlines and invalid browser
URLs, plus the two standalone lock tests (about seven seconds before correction)
and the missing protected auth metric. The counter tests verify bounded failure,
complete rollback and recovery. New metrics checks exclude attributed, older and
unrelated proofs and verify that unauthorized metric reads are denied.

Local checks pass a clean npm **10.9.4** install, **42** environment variables,
typecheck, lint, formatting, **554 unit/component tests in 82 files**, production
compilation, **17 Chromium journeys with retries disabled**, and Docker smoke.
The scanner force-termination assertion was rerun after the final signal option
was added. The full database suite passes **324 tests in 48 files** (1,110.74
seconds locally), including the existing auth rollback/concurrency and new
standalone contention, future-lease and protected-metrics regressions. New-head
CI is recorded in the PR; prior green CI is not claimed for a new commit while
its checks run.

The actual deployment CLI returns failure by default and with `--public` for
unconfigured attribution, succeeds only with a visible private-mode opt-out or
a selected header, and warns for appending-forwarded-chain risk. Passing checks
explicitly say network trust is unverified. Production startup tests require
trusted attribution or private shared-bucket acknowledgement and always refuse
disabled enforcement. Both upstream audit gates pass according to the documented
policy: production has zero findings; the raw full audit retains eight dev-only
entries for the exact November 11 exception. No expiry bypass was introduced.

The browser auth regression aggregates all fixed windows and checks token/email
counts against committed admission proofs rather than assuming a single window.
It explicitly asserts untrusted proxy configuration. The correspondence test
observes the future timestamp/status/attempt/lease before advancing its target; a
database regression proves future jobs are unclaimable until due. T3 browser
inspection of the rebuilt confirmation screen at **1440×900** and **375×812**
found no console errors or horizontal overflow; existing committed screenshots
remain representative because this follow-up changes no UI markup.

Shared scanner, expiry reporting, weekly workflow and fixture corrections were
also applied independently to #39: **501 unit/component tests**, **seven focused
lease integration tests** and **15 browser journeys without retries** pass. Its
nine-package inventory retains the installed `@shadcn/registry` wrapper; this
branch removes that absent entry. Neither branch changes supported toolchain
majors, broker activation, legal contents, encryption, request approval or
external-sending gates during this follow-up.

## Counter and diagnostic follow-up

The three subsequent review findings were reproduced before correction: **six
unit failures** cover null/undefined/array-like counter results and actual CLI
startup/advisory/privacy failures; **three integration failures** cover empty,
oversized and duplicate batches. PostgreSQL regressions check both standalone
and caller-owned transactions, the sixteen-identity boundary and distinct tuples
containing colons. A real second-write SQL constraint failure still proves
rollback after the first write, rather than relying on rejected input validation.

The latest **562 unit/component tests in 83 files** pass, including five real
child-process diagnostic tests with valid and invalid production configuration.
The CLI refuses disabled enforcement and unacknowledged private shared-bucket
use, preserves strict public checks, and excludes a synthetic configured value
from both output streams. Typecheck, lint, the **42-variable** environment check,
production build and production Docker smoke pass. Both dependency gates pass
under the existing policy: zero production findings and eight explicitly
excepted development entries, with the November 11 expiry still blocking.

All **17 Chromium journeys pass with retries disabled** in a fresh isolated
browser schema. The first attempt stopped in global setup because the fresh
schema had not been migrated; applying the existing seventeen migrations
resolved that setup error before the passing run. No application or CI behavior
was changed to accommodate it. T3 inspection of the rebuilt confirmation at
1440×900 and 375×812 CSS pixels found no console errors or horizontal overflow.
No UI markup changed, so existing committed screenshots remain representative.

The full PostgreSQL suite passes **328 tests in 48 files** (1,031.39 seconds).
The existing suppressed-audit failure injections still emit the documented
Prisma 6 engine panic diagnostics; those tests prove rollback and recovery and
the complete suite passes. New-commit CI is recorded in the pull request;
previous green CI is not used to certify this follow-up while its checks run.

## Empty policy compatibility follow-up

The next review reproduced two failures: `consumePolicies([])` threw with its
actual default repository port, and it unnecessarily invoked a supplied counter
port. The helper now returns `[]` before counter work. The repository still
rejects empty batches and requires one to sixteen distinct identities; the
authentication gate still supplies both fixed email and network policies.

Both new regressions failed before correction. The latest **564 unit/component
tests in 84 files** and **36 focused authentication/counter integration tests in
two files** pass, including concurrent direct API admission, mandatory proof
rollback, malformed results and repository batch validation. Typecheck, lint and
formatting pass. No UI, dependencies, migrations or database repository code
changed in this follow-up. Full integration/browser/build/Docker checks passed
on preceding commit `fe7e047`; new-commit CI reruns those suites before readiness.
Those previous results are not claimed for a new commit while its checks run.

## CLI verification isolation follow-up

Three new regressions fail before correction: an invalid inherited sender or
parent dotenv file changes an otherwise valid diagnostic into failure, and a
simulated subprocess timeout returns a null status without a useful explanation.
They pass with an explicit synthetic child environment, an empty temporary dotenv
fixture and a clear interrupted-process error. Only platform process variables
are inherited. The eight tests include actual Node processes; only the timeout
case injects a process result. Temporary fixtures are removed after the suite.

The CLI suite has a local thirty-second deadline, covering the test with two
ten-second subprocesses plus runner overhead. Each child uses forced termination
at its existing ten-second limit. Global test defaults, CI retries and production
database/admission budgets are unchanged. The diagnostic logger is documented as
one-off CLI startup use, matching its sole production call.

All **567 unit/component tests in 84 files**, typecheck, lint and formatting pass.
No application runtime behavior, UI, dependencies, migrations or sending gates
changed. Preceding `b158d8c` passes full CI, including **328 integration tests**,
**17 browser journeys without retries**, production build and Docker smoke;
the new commit reruns those checks before readiness. Prior-commit results are
not claimed for an unverified new commit.
