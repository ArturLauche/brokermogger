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
therefore correctly expects nine emitted links from sixteen counted attempts,
not an exemption for rejected email attempts.

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
