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
Node/framework pins remain unchanged. The review follow-up updates compatible
transitive security fixes and introduces a bounded development exception.

## Dependency review follow-up

PR [#39](https://github.com/ArturLauche/brokermogger/pull/39) was originally reviewed at
`39447997411b21a0538069f418769bb90c29f773`. Its October 8
[CI run](https://github.com/ArturLauche/brokermogger/actions/runs/37784751876)
failed at installation. A clean npm 10.9.4 install of those manifests
fails with `EUSAGE`, missing `msw@2.15.0` and associated dependencies. npm 11
accepts that revision, so testing only the newer installer hides the failure.
The unchanged main manifests install cleanly with npm 10 and npm 11; Docker
also exercised the pinned Node 22 runtimes. No legacy peer-resolution flag was
used. In response to the owner review, #39 is repaired on its own branch with
compatible minor/patch updates. TypeScript 7, Prisma 7, ESLint 10, MSW 3,
Vitest 5 and Node 26 types remain separate migration work. The Vite React plugin
update is also deferred after npm 10 exposed an optional Babel 8 peer conflict.
Neither branch depends on merging the other.

The original dependency tree reported 14 audit findings with the initial npm 11
installation (2 moderate, 11 high, 1 critical). The critical advisory concerns
transitive `proxy-addr` ([GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)).
Compatible lockfile updates resolve six of seven underlying advisories, including
both production findings. The remaining braces advisory has no patched upstream
release. The full audit still runs at moderate severity; its narrow, dev-only,
advisory-specific exception expires on November 11 and has fail-closed policy
tests. CI also runs an unfiltered production audit. See the exact
[inventory, changes and exception](dependency-security.md). A green policy gate
does not mean the raw full audit has zero findings.

The owner review reproduced a previously missed defect: admission used
best-effort auditing after its counter transaction. An audit failure could permit
a token/email without a proof. `withMagicLinkAdmission()` now binds both counter
writes and `recordAuditOrThrow()` to the same Prisma transaction using narrow
ports. Existing chain locking and lock order remain intact. Database triggers
inject rejected and suppressed audit/counter writes; regressions assert rollback,
generic known/unknown/JSON/form replies, no tokens or emails, retry only in a fresh
request, single-flight callback/provider checks and concurrent chain integrity.
The two initial injection tests failed before the implementation fix.

`npm run check:deployment` makes missing trusted attribution or disabled abuse
protection an explicit deployment preflight failure by default. `--single-user`
selects a visibly advisory private-instance check; `--public` remains strict.
Production startup also rejects these settings unless private shared-bucket use
is explicitly acknowledged (disabled enforcement is always refused). The check
cannot attest to ingress topology; documented checks cover header overwrite,
blocked direct ingress and forged headers from controlled sources.

## Additional deployment and review safeguards

The subsequent twelve-finding review exposed a confirmed unsafe deployment
example: the production Compose app port was published on every interface even
though trusted-header documentation required blocking direct access. Both shipped
app bindings now use loopback; Docker smoke parses all three actual Compose files
and rejects unrestricted app publication. The guide covers existing-container
recreation, private containerized proxies, direct routing and Docker versions
whose loopback publication alone does not establish isolation.

Other findings were engineering weaknesses: production could silently share one
login bucket or disable enforcement; default preflight was advisory; appending
forwarded chains lacked an operational signal; standalone counters and the audit
subprocess had inconsistent or absent deadlines. Production now refuses disabled
enforcement and requires configured attribution or an explicit private-instance
shared-bucket acknowledgement. Public preflight is strict by default, private
mode is visibly advisory, and passing configuration cannot attest network trust.
The existing protected metrics endpoint counts committed unattributed auth
attempts for the last day without new identifiers or public diagnostics.

Single/batched counters and mandatory admission share a bounded database helper.
Malformed counter-port cardinality or values throw `INTERNAL_ERROR`, preserving
the surrounding admission rollback. Browser guards now explain missing/malformed
URLs without echoing their input. The auth journey aggregates all fixed windows,
compares token/email issuance with committed proofs and explicitly verifies the
untrusted-header fixture. Delayed jobs are observed before advancing them; a
database regression proves future work cannot be claimed prematurely.

The audit subprocess has a five-minute forced-termination budget. The absent
`@shadcn/registry` entry was removed from this branch's exception; #39 retains its
own installed wrapper. Every exception report prints days remaining and warns in
Actions within 14 days of expiry. A weekly workflow runs both gates after merge.
The suggested non-blocking expiry was rejected: expired exceptions still fail.
Shared audit and isolated-fixture changes are copied to #39 independently; its
application/proxy configuration and supported dependency versions stay separate.

Production operators must review the new startup requirements before upgrading.
Private acknowledgement never raises the allowance or enables real sending. No
schema migration, broker activation, legal conclusion or personal-data retention
change accompanies these safeguards. Final local and new-head CI evidence is
recorded in the validation document and pull requests.

## Counter and diagnostic follow-up

The next review found an internal repository limitation: the batch counter port
accepted empty, duplicate or arbitrarily large identity arrays. Current auth
callers supply two fixed identities, so this was not demonstrated as a remotely
reachable amplification defect. The repository now validates one to sixteen
identities and rejects repeated database uniqueness tuples before any write,
including caller-owned transactions. A real PostgreSQL constraint failure still
tests rollback after the first write; validation does not replace that check.

Two defects reproduced separately. Non-array injected counter results threw a
`TypeError` instead of the promised `INTERNAL_ERROR`; result validation now checks
the array shape first. The deployment CLI initialized an environment-dependent
logger before it could explain invalid production settings, and uncaught
validation messages could print configured values. A diagnostic logger retains
normal redaction and safe error serialization without reading unvalidated
configuration or reconfiguring runtime logging. The CLI prints its private-mode
advisory before validation, catches failure and reports a fixed safe error.
Production enforcement, explicit private acknowledgement and strict public
checks remain required. Real child-process regressions cover these behaviors and
exclude a synthetic private value from both output streams.

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

1. Replace the expiring braces exception with a patched release when available.
   Evaluate TypeScript, Prisma, ESLint, MSW, Vitest, Babel/plugin and Node-type
   migrations in independent compatibility PRs.
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
