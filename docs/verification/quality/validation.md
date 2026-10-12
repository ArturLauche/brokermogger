# Verification of the October 2026 change

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
