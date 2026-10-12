# October 2026 security and catalogue improvements

## Scope and baseline

Work began from freshly fetched `main` commit
`2a030780539d998dc93220e189512ca0bce80453`. The checkout was clean. Recent merged
PR #35 already completed substantial workflow, encryption, operator and interface
work; this change extends those boundaries. There were no open issues. Open
Dependabot PRs were inspected rather than combined with the feature work.

The baseline clean install, environment consistency, typecheck, lint, formatting
check, 478 unit/component tests, configured production build and 15 browser
journeys passed. This workspace had no `.env`; database/build/browser commands
used isolated synthetic configuration with `EMAIL_PROVIDER=mock` and
`ALLOW_EXTERNAL_SENDING=false`. PostgreSQL was reached through `docker:5433`.
The production smoke test used its own disposable containers and generated keys.
The first full database run was invalidated by overlapping fixture resets and
source edits; it is not reported as a baseline pass. A fresh sequential run on the
completed change replaced it.
No real broker was contacted.

## Confirmed defects

- **Direct endpoint bypass:** `lib/auth/magicLink.ts` applied only the email
  quota. Twelve real HTTP requests to different synthetic addresses produced
  twelve simulated messages and tokens and zero network buckets, exceeding the
  intended ten-per-network allowance. The form and direct endpoint now share a
  pre-issuance gate, atomic counters and request-local decisions.
- **Unverified forwarding trust:** `lib/auth/requestContext.ts` used the first
  `x-forwarded-for` value or `x-real-ip` without a deployment trust decision.
  Headers are now ignored by default and accepted only under the documented
  ingress contract. Invalid or absent attribution retains a shared quota.
- **Response inconsistency:** browser verification showed different origins for
  allowed and denied Auth.js verification redirects when build and runtime
  origins differed. The route canonicalises redirect and JSON verification
  replies; first-leg token generation/delivery remains behind the same gate.
- **Inactive preparation links:** `app/(app)/brokers/page.tsx` sent inactive real
  drafts into preparation, although the domain rejects generation. Discovery now
  opens instructions, and inactive preselected records are not checked.

The counter repository also fails closed if a database trigger suppresses an
insert instead of silently treating an empty result as one successful attempt.
Regression tests cover a suppressed second write and transaction rollback.

## Engineering weaknesses and product opportunities

Auth-generated token links were not explicitly pinned to `APP_BASE_URL`. They
now use the configured callback origin, including its port, while preserving the
authentication path and token. A core HTTP test exercises an untrusted origin.
Existing redirects, CSRF, session invalidation and token handling remain intact.

Broker activation requirements were visible mainly as errors after a failed
save. The editor and list now derive readiness from the same domain decision as
the activation command. Stages distinguish discovery, contact review, method
review and observed response behavior. Real drafts, fictional examples, manual
methods, email contacts and stale reviews have explicit explanations. Private
contact evidence notes are omitted from user catalogue projections. No real
entry was verified, activated or enabled by this change.

Legal source dates existed without a focused review-work filter. Operators can
now find the oldest draft/published version needing source or legal review.
Missing reviewer/source fields, future dates, the existing review flag and
180-day source age are visible. These reminders do not change legal content,
publication or applicability. Broker reminders use 90 days; neither interval is
a statutory period or a new automatic sending rule.

The development Dependabot group included major toolchain upgrades. It now groups
only minor/patch releases. Major updates remain separate compatibility work;
package versions, the lockfile, Node pins and CI gates were not changed.

## Dependency blockers

PR [#39](https://github.com/ArturLauche/brokermogger/pull/39) remains open at
`39447997411b21a0538069f418769bb90c29f773`. Its October 8
[CI run](https://github.com/ArturLauche/brokermogger/actions/runs/37784751876)
failed at installation. A clean npm 10.9.4 install of its current manifests still
fails with `EUSAGE`, missing `msw@2.15.0` and associated dependencies. npm 11
accepts that revision, so testing only the newer installer hides the failure.
The unchanged main manifests install cleanly with npm 10 and npm 11; Docker
also exercised the pinned Node 22 runtimes. No legacy peer-resolution flag was
used. The feature PR does not repair or update #39's separate branch.

The unchanged dependency tree reports 14 audit findings with the initial npm 11
installation (2 moderate, 11 high, 1 critical). The critical advisory concerns
transitive `proxy-addr` ([GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)).
The CI `npm audit --audit-level=moderate` gate remains enabled. Dependency
remediation is an explicit blocker to declaring this PR CI-ready, so the PR is a
draft rather than claiming every CI gate is green.

## Operational and privacy review

The dispatch, approved-message, legal-eligibility and manual-submission paths
retain ownership checks, consent/snapshot proofs, current recipient checks and
all instance sending gates. Provider acceptance, receipt and completion remain
separate records. The existing job queue retains fencing, reconciliation,
resumable deletion and idempotent webhook imports. Sensitive downloads stay
owned, masked or explicitly confirmed, and encrypted storage is unchanged.
Existing integration and browser suites exercise these flows; this is not a
claim of exhaustive security certification.

Exports already use bounded projections/pages but accumulate complete buffers;
reports accumulate projected request rows before rendering. A measured allocation
experiment was discarded because it did not demonstrate a reliable improvement.
The benchmark now includes full PDF generation, encrypted publication and private
downloads. See [performance evidence](performance.md#october-12-artifact-measurements).
No plaintext cache, output truncation, encryption change or provider latency claim
was introduced.

## Review cycles

Two primary-agent review cycles are documented; these are self-reviews, not
independent human approvals.

1. **Security and architecture:** checked entry-point coverage, transaction
   failure, request-local admission, origin trust, ownership, immutable proofs,
   broker activation and legal publication. Responses included origin pinning,
   fail-closed empty counter writes, blind-index decision keys and distinguishing
   retired verified records from source drafts.
2. **Browser, accessibility and regression:** followed form/direct authentication,
   public discovery, operator readiness and existing request journeys. This found
   the redirect-origin inconsistency and a checkbox-name regression caused by
   adding readiness text. The route now normalises verification replies and
   readiness uses `aria-describedby` while preserving checkbox names. Desktop and
   mobile checks, keyboard paths, automated accessibility checks and fresh
   regression runs verify the corrections.

## Prioritised follow-up work

1. Repair #39's lockfile under the pinned CI installer and split its TypeScript,
   Prisma, ESLint, Vitest and MSW major upgrades. Independently resolve the
   inherited audit findings, starting with production-reachable dependencies.
2. Verify real broker methods/coverage with operators and primary-source evidence.
   A validated import preview could follow once a licensed source and a repeatable
   review process exist; it must retain dry-run, duplicates, provenance,
   authorization and explicit application approval. Do not scrape a directory.
3. Add a source/evidence history and explicit reviewer attestations for contact
   rechecks, then measure whether age-based queues need dedicated indexes.
4. Design streaming authenticated storage/exports as a separate change with
   crash recovery, deletion, completeness and ownership tests. Current whole-buffer
   storage and report rendering remain a measurable memory limitation.
5. Add verified holiday calendars with source/territory/year completeness and
   explicit review. Current uncertain business-day timing must remain uncertain.
6. Expand dashboard prioritisation and manual recovery after observing real user
   journeys; do not replace already working workflows or claim provider acceptance
   proves removal.
