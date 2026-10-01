# Workflow completion and privacy hardening

Implementation branch: `codex/privacy-workflows-polish`.

The accepted plan preserves the Next.js / PostgreSQL / Prisma / shadcn stack,
blue/slate identity, existing routes, and all product safety rules. External
broker sending remains disabled during development and tests.

## Baseline

At `62b6f34`: type checking, lint and formatting passed; 314 unit/component,
43 integration and two browser tests passed; production build succeeded.
The audit found broken draft rendering, sign-out, consent routing, unencrypted
files and snapshots, incomplete erasure and workflows, mobile overflow and CSP
violations. Landing JavaScript transferred approximately 188 kB. These passing
checks did not establish complete user journeys.

## Delivery checklist

- [x] Regression coverage, seeded rendering, sign-out, public invitations,
      dependency advisories.
- [x] Versioned encryption, encrypted authentication lookup, strict key
      validation, safe uploads/downloads, recoverable object deletion.
- [x] Immediate account access blocking and resumable erasure; equivalent
      profile/identifier deletion; minimal audit/consent proof retention.
- [x] Focused request services, ownership boundaries, atomic generation/quota
      and approval/outbox, complete approval envelopes, dispatch revalidation.
- [x] Fenced job leases, heartbeats, cancellation and ambiguous-send recovery.
- [x] Resumable onboarding and profile editing; complete household consent.
- [x] Draft editing, contextual follow-ups, manual submissions, responses,
      verification, closure and recovery actions.
- [x] Notifications/preferences, reports and masked/sensitive exports.
- [x] Operator catalogue and immutable legal/template publication, settings.
- [x] Sourced EU/EEA and US state packs, correct deadlines, disabled real
      broker drafts and inactive future law versions.
- [x] Shared UI tokens, responsive shell, readable review, useful dashboard,
      accessible paginated tables and complete interaction states.
- [x] Runtime metadata, strict CSP, Docker roles/storage, operational health,
      backup/restore and upgrade documentation.
- [x] Measured performance comparisons; retain only demonstrated safe wins.
- [x] Migration/recovery rehearsals, ownership/concurrency/encryption tests,
      real browser journeys, all screen sizes, accessibility and production QA.

PR creation, T3 registration and the final revision's CI results are recorded in
the delivery PR. They are delivery steps rather than application features.

## Final verification coverage — 2026-10-01

The seven implementation areas are complete. The delivery PR is the authoritative
record of the final whole-suite run and matching-revision CI status. The following
coverage is implemented and exercised; historical entries below retain the counts
and open work at their respective checkpoints.

| Check                    | Coverage                                                                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Static checks            | Type checking, ESLint, Prettier and the 40-check environment catalogue                                                                                                            |
| Unit/component tests     | 461 cases across 70 files                                                                                                                                                         |
| Integration tests        | 275 cases across 46 files, including 350 complete sourced-catalogue journeys in five matrix cases                                                                                 |
| Production browser tests | 15 Chromium journeys under strict CSP, including actual magic-link authentication and account erasure                                                                             |
| Complete interface       | 48 routes at 320, 375, 768, 1024 and 1440px: 240 captures with no overflow, heading/label defects, unexpected console/CSP errors or axe AA findings                               |
| Keyboard and zoom        | 101 passing navigation, dialog, focus and layout checks; zoom is an automation approximation                                                                                      |
| Production output        | Runtime canonical/Open Graph origins, one H1, language, private noindex redirects, actual 404 status, sitemap, robots, favicon and llms.txt; no public source maps                |
| Dependency audit         | Zero reported vulnerabilities across production and development dependencies                                                                                                      |
| Migration and recovery   | 17 migrations; isolated historical/backfill/deadline rehearsals; separate non-root Docker roles, encrypted shared storage, database/object backup restoration and resumed erasure |
| Performance              | Repeated 100/1,000/10,000-request fixtures, raw query/size/latency/memory/worker measurements and three cold public-page contexts                                                 |

The final browser pass and all 240/101 interface checks pass on the standalone
production build. Destructive confirmation remains visible through pending work,
retains the entered phrase after an error and requires a fresh phrase when reopened.
The deletion journey proves immediate session/access blocking and successful
leased removal of identifiers, private ciphertext and a stored object.

Final catalogue testing exposed two fixtures that installed seeds using the wall
clock and then attempted to test the preceding legal version. Their installation
clock is now explicit and precedes commencement; separate boundary tests still
verify activation with a warm cache. All 18 seed/version checks pass after the
correction. Outstanding seed writers are drained before fixture cleanup.

The measured public JavaScript transfer falls from 190,430 to 156,299 encoded
bytes (18.0%). Complete masked exports at 10,000 requests fall from 10.1 to
5.1 seconds with identical record counts and output size. Slower report/audit
measurements, memory limitations and rejected speculative optimizations remain
documented in [performance verification](performance.md).

See [interface comparisons](interface-verification.md),
[private-storage upgrade](upgrade-private-storage.md),
[deadline/index migration notes](response-targets.md),
[deployment](production-deployment.md) and [backup recovery](backup-and-recovery.md).
External broker sending remains disabled throughout development and verification.

## Migration commitments

Use additive schema changes and resumable backfills, verify counts and hashes,
preserve historical snapshot IDs and content hashes, and reject legacy queued
approvals that cannot prove their full envelope. Retain sent history. Do not
claim completion of a purge until storage deletion succeeds. Document key
requirements, maintenance and rollback boundaries in the upgrade guide.

## Verification log

New validation results are recorded here as the corresponding work is completed.
The original audit screenshots were lost when the temporary environment reset.
The baseline was recreated from the base commit in an isolated checkout for the
final visual comparison. Earlier log entries preserve the status and test counts
at that time. The checklist and final verification record above describe the
current result.

### US state coverage and future commencement

- Added 19 sourced state packs alongside California, with state-specific scope,
  request wording, receipt-based periods and conditional extensions. Iowa does
  not acquire a correction right; provided-data and controller-threshold limits
  remain explicit. The review screen now exposes applicability, verification,
  confidence, source and review date before approval.
- Future Connecticut, Delaware and Utah amendments wait for their effective
  instant. Catalogue reads reevaluate time even with a warm cache. India uses
  voluntary requests until May 13, 2027; final commencement and Rule 14 were
  checked against the Gazette. Grievance timing is not an initial request limit.
- Upgrade regressions first reproduced obsolete generic-US/premature-India
  eligibility, reenabled jurisdictions and delayed cache-boundary activation.
  Seed upgrades now retire untouched unsafe defaults, preserve history and
  operator-authored choices, and keep disabled jurisdictions disabled.
- Typecheck, lint, formatting and all 431 unit/component tests pass. All 17
  seed/history integration checks pass. The journey matrix completes 210 EU/EEA
  journeys and 80 additional state/voluntary journeys through approval, manual
  submission, confirmed response and report without outbound email. The first
  extended fixture incorrectly expected a precise date flag for a no-period
  policy; its corrected US/India rerun passes. California DROP separation,
  sourced broker entries, operational/performance work and full final delivery
  verification remain in scope.

### Rendered reply identity and atomic legal recheck

- Five failing regressions reproduced body/header reply-address mismatches,
  configuration changes silently accepted during generation/editing, and a
  withdrawn rule persisting a new draft. Rendering now uses the same owned
  sending identity as the sealed envelope. Persistence checks its digest and
  rechecks current legal eligibility before reserving request quota.
- Receiving aliases are encrypted, account-scoped and reusable. Changed settings
  require regeneration rather than changing the headers beneath unchanged text.
  Historical text remains immutable; snapshot variables store no raw reply alias.
- Typecheck, lint, formatting, all 431 unit/component tests and 25 generation,
  editing, receiving and identity integration cases pass. Additional concurrent
  alias and cross-account checks are included in the final targeted rerun.

### Submission channels and sourced broker drafts

- Legal applicability now includes explicit submission channels. Legacy ordinary
  rules cannot authorize DROP; malformed channel restrictions fail closed. DROP
  has dedicated preparation templates, official manual steps and no invented
  direct-letter response deadline. Checking an existing platform status is a
  correspondence action, not another submission. Operators can author and review
  the channel restrictions without rewriting published history.
- Follow-ups and regeneration use the current applicable legal version, with a
  transactional eligibility recheck. The original submitted snapshot and response
  clock stay pinned. Voluntary broker suppression remains available in all 20
  supported US states without borrowing a statutory deletion right.
- Added Epsilon, LiveRamp and PeopleConnect as sourced, inactive manual drafts.
  Contacts and coverage remain unverified; sending is disabled. PeopleConnect
  public-search suppression is separate from website-user-data deletion, which
  can remove existing suppressions. Repeated or competing seeds preserve operator
  edits and do not reactivate entries.
- All 437 unit/component tests and 42 related integration checks pass, including
  failure-first channel and replacement-law regressions. The complete coverage
  matrix passes 314 journeys through approval, manual submission, confirmed
  response and a complete report. Its fixed legal-review clock initially differed
  from PostgreSQL creation timestamps; the synthetic dates now agree. Three
  channel checks and two broker-seed preservation/concurrency checks pass.
- Typecheck, lint, formatting and a fresh production build pass. The production
  browser journeys pass DROP preparation/submission and operator channel editing,
  with no console, hydration or CSP errors. Initial browser assertions raced the
  navigation and expected unsorted channel values; corrected assertions pass.
  The remaining final interface, operations, benchmark and PR/CI work is ongoing.

### Live legal eligibility at approval and dispatch

- Five failing regressions reproduced approval/sending against withdrawn rules,
  inactive jurisdictions and replaced versions, including with a warm catalogue
  cache. Approval and each dispatch gate now read the applicable legal version
  directly under the parent locks. Changed legal content requires a fresh draft;
  immutable historical messages remain available for review.
- A blocked queued attempt cancels its job and unused outbound intent atomically,
  withdraws approval authority and creates an actionable notification. A scheduled
  replacement does not invalidate the current rule before its effective instant.
- All 19 approval/dispatch integration tests passed using local mock delivery.

### Foundation pass

- Corrected declared template variable limits and deterministic newline rejection.
  A regression iterates every published seed rule/template pairing.
- Replaced raw sign-out POST with the Auth.js server action and allowed public
  consent links through the workspace redirect.
- Moved draft persistence into an ownership-checked transaction containing quota,
  snapshots and events. Rendering happens first. Database failure and concurrent
  duplicate-generation tests verify rollback and actionable conflict handling.
- Drafts no longer start a deadline before submission. References now contain
  128 bits rather than 24 bits. Identifier selections reject foreign IDs.
- Updated Next.js / ESLint to 16.3.5 and Vitest to 4.1.11; refreshed affected
  transitive dependencies. `npm audit`: zero known vulnerabilities.
- Typecheck, lint and format passed; 320 unit/component tests and 48 integration
  tests passed, including injected snapshot-persistence failure and
  concurrent generation. Actual browser sign-out remains in the final journey pass.

### Privacy implementation in progress

- New evidence, generated report files, snapshot text and webhook payloads are
  encrypted with record-bound authenticated encryption. Evidence has durable
  upload/purge states, signature/size checks, expiry enforcement and safe headers.
- Added an email-only Auth.js adapter with encrypted login addresses and blind
  indexes for email and verification-token identity lookup. Session operations
  refuse pending-deletion accounts. Existing sessions expose no raw token in UI reads.
- Runtime build-bypass checks and canonical key/key-ID validation now reject
  example material in production. Error serializers omit messages and SQL arguments.
- Account access blocking, session revocation, cancellation and purge scheduling
  are atomic. Content erasure and storage purging are resumable. Profile/identifier
  deletion removes affected message copies and schedules file cleanup.
- Added additive migrations and a verified, resumable legacy-payload backfill.
  See `docs/upgrade-private-storage.md` for maintenance and rollback boundaries.
- Typecheck and lint passed. The broader run passed 333 unit/component tests and
  59 integration tests, including profile erasure and the migration rehearsal.
  The complete browser/production acceptance suite remains pending.

Still to finish in this area: full-envelope approval/dispatch migration gates,
receiving/response content flows, comprehensive exports, final operational/UI
verification, and production key/build checks against the compiled app.

### Worker leases

- Every claim receives a fresh token. Heartbeats, completion, cancellation and
  retries require the unexpired token. Stale workers cannot replace a newer
  result or revive cancelled jobs; expiry uses a conditional database-time write.
- Workers claim jobs when ready to execute instead of letting a local batch expire.
  Administrator retries/cancellations are limited to eligible states.
- Five PostgreSQL regressions cover competing workers, stale completion/retry,
  renewal, cancellation during execution and error-message minimisation.

### Approval and request orchestration

- Split generation, approval, dispatch, actions, responses and follow-ups into
  focused services. Persistence transactions remain inside repositories.
- Snapshots now seal a versioned envelope covering the text hash, recipient,
  channel, sender/reply address, selected identifiers and legal/template versions.
  Approval, consent proof, events, outbound intent and the send job commit together.
- Dispatch rechecks active account status, ownership, current consent and its
  proof, identifiers, the exact broker contact, sending switches and worker lease.
  System and emergency-access actors cannot approve another person's message.
- Provider ambiguity is explicit. Retries preserve the approved message and
  idempotency key and stop before the provider's 24-hour retention expires.
  Cancellation after dispatch begins is described as uncertain, never a recall.
- Follow-up scheduling and publication are atomic and concurrent-safe, and a
  follow-up clears current approval authority while preserving sent history.
- Seven additive migrations applied successfully to the isolated test database.
  Typecheck, lint and formatting passed; 336 unit/component and 76 integration
  tests passed. These include injected approval enqueue failure, duplicate
  approval, foreign/system approval denial, consent revocation, cancellation
  during dispatch, uncertain old sends, and concurrent follow-up preparation.
- Remaining related work: draft editing/regeneration and legacy review UI,
  explicit operator reconciliation, receiving/response workflows and sourced
  receipt-based deadline policies. These remain in the approved implementation scope.

### Editable profiles, household consent and draft revisions

- Onboarding saves and resumes one profile. Identifiers, completion and consent
  proof commit together; duplicate submissions do not create duplicate profiles.
  Profile/identifier editing preserves entered values after validation errors,
  normalises US states, validates timezones and synchronises primary identifiers.
- Approval envelopes now bind profile identity and residency too. Profile or
  identifier edits withdraw affected queued authority. Snapshot persistence checks
  the rendered identity again to reject a concurrent edit rather than sealing old
  text against new profile details. Deleted primary identifiers also erase matching
  profile copies and affected request content.
- Draft editing and regeneration create new immutable snapshots, retain request
  references and require fresh approval. A queued approval can be withdrawn before
  editing; started or uncertain delivery must be reconciled first.
- Household invitations collect the real name, contact address and residence.
  Accept/decline, consent proof and notifications commit atomically. Resends replace
  old links; represented adults can withdraw permission using their invitation.
  Expired, declined, revoked and simulated/failed delivery states are explicit.
  Identity/residency changes require fresh household consent. Removing a household
  profile uses the same content-erasure path as the vault.
- Consent history checks the supplied profile's actual owner. Account-local event
  timestamps use a validated timezone; request-scoped authentication reads are
  memoized without storing user data across requests.
- Typecheck, lint and formatting passed. All 338 unit/component tests and 92
  integration tests passed. Production compilation passed with build-only keys.
  New tests cover onboarding/consent failure injection, repeated and competing
  submissions, stale edits, generation/edit races, revocation, expiry, failed
  invitation delivery, cross-account access and primary-identifier erasure.
- Browser workflow validation, responsive/visual polish and the remaining response,
  manual submission, notifications, reports, exports and operator tools are still
  pending. This checkpoint does not mark the overall plan complete.

### Authentication browser regression

- A production browser run exposed an Auth.js callback that used the internal
  `localhost` host rather than the configured application URL. Redirects now use
  the canonical instance origin and reject off-instance targets.
- Actual magic-link sign-in, resumable onboarding, profile and identifier edits,
  timezone validation, session-clearing sign-out, and public household permission
  acceptance/withdrawal passed in Chromium against the production build. Mock
  delivery and a separate database schema kept all test activity local.
- The redirect fix passed typecheck, lint, formatting, ten authentication unit
  tests and production compilation. Two workflow browser tests passed.

### Manual submission and delivery recovery

- Approved manual messages have downloadable text, contextual portal/postal steps,
  account-local submission/receipt dates and optional evidence. A transaction pins
  the exact approved snapshot, records dates and appends status history. Duplicate
  submissions are idempotent; account/profile erasure removes these new records.
- Uncertain provider attempts have an explicit, owner-confirmed reconciliation
  action. Active workers, foreign accounts and conflicting outcomes are rejected.
  Non-acceptance requires a new reviewed draft; acceptance never claims delivery.
- Verification actions are available after a confirmed broker request. Optional
  identity storage also rechecks that current state inside the file transaction.
- Eight new integration regressions passed alongside approval, dispatch, editing,
  evidence and erasure regressions: 29 tests across five files. The new migration
  applied to the isolated database. Browser coverage of these new screens will
  accompany the response workflow; it has not yet been run.
- Fixed an existing parallel-test race: mock-email tests now remove only their own
  files instead of deleting the shared mail directory while other tests write it.

### Correspondence and receiving

- Added manual response recording, a paginated correspondence inbox, private
  plain-text review, explicit classification/status confirmation, unmatched-reply
  assignment and content erasure. A saved reply never changes status automatically.
  Concurrent saves and confirmations are idempotent; stale reviews are rejected.
  Applying a confirmed outcome cancels pending sends and follow-ups atomically.
- Added optional signed Resend receiving with per-account random reply aliases
  sealed in the approval envelope. Full content is retrieved separately through
  a fixed, bounded provider endpoint. Only a unique full reference within the
  recipient's account matches a request. Missing/ambiguous references and permanent
  retrieval failures remain visible for manual review. No remote HTML, images or
  attachments execute or download in the interface.
- Encrypted response content and private receiving metadata; extended erasure to
  unmatched correspondence and aliases. The resumable backfill preserves legacy
  sender/preview/metadata, verifies encryption and labels previews incomplete.
  Delivery callbacks retain only required receipt fields, including after upgrade.
- Delivery updates now fence the worker lease and commit the ledger, lifecycle
  history and processed marker together. Late callbacks preserve newer drafts;
  deliveries cannot reverse a bounce or complaint. Unmatched receipt recovery and
  retention are explicit. Exhausted requested retries become recoverable failed
  jobs instead of unclaimable retryable rows.
- Nine migrations applied to both isolated integration and browser schemas.
  Typecheck, lint, formatting, environment consistency and production compilation
  passed. All 346 unit/component and 120 integration tests passed; the final
  receiving/receipt recheck passed another 12 tests after boundary refinements.
- Chromium passed the complete manual journey: magic-link sign-in, onboarding,
  draft generation/editing, approval, text download, submission recording, hidden
  reply review and explicit completion. The two authentication/household browser
  journeys also passed against the production build with strict staging CSP and
  simulated delivery. This validates functionality; the known CSP style issues and
  full visual/accessibility review remain in the production/UI acceptance work.
- See `docs/correspondence.md` for receiving setup, limits, matching, erasure and
  recovery. Notifications/preferences, reports/exports, operator tools, sourced
  coverage/deadlines, interface polish, production work and final PR remain pending.

### Notification inbox and preferences

- Added an ownership-scoped inbox with stable pagination, unread/all/dismissed
  filters, read/unread, dismiss/restore and safe contextual links. Email remains
  off by default and requires a verified account holder's explicit opt-in.
- New notifications and their optional email jobs commit atomically. Generic
  reminders carry no broker names, profile details or reply content. Dispatch
  checks the current consent identifier, account state, unread state and worker
  lease. Opt-out, reading and dismissal cancel pending work; opting back in never
  revives older emails. In-flight cancellation remains honestly unconfirmed.
- Migrated legacy unsent notifications to in-app updates and cancelled their
  unproven email jobs. Fixed the deadline-warning query so in-app-only warnings
  do not repeatedly occupy the first batch. See `docs/notifications.md`.
- Ten migrations applied to integration and browser schemas. Typecheck, lint,
  formatting and production compilation passed. All 346 unit/component tests,
  50 relevant integration tests and all three Chromium workflow journeys passed.
  Browser coverage includes opt-in/out, household-triggered notifications,
  read/dismiss/restore, sign-out and manual correspondence. Delivery stayed local.
- Reports/exports and the remaining approved scope are still in progress; no PR
  has been opened yet.

### Complete, private reports

- Report requests validate dates and actual profile ownership, deduplicate form
  submission, and commit the report and queued job atomically. Calendar ranges
  capture the account timezone and include the entire end day across daylight
  saving changes. Historical files retain their original UTC interpretation.
- Generation reads narrow pages of 250 without the previous 10,000-row cap.
  Account and lease checks protect every page and final publication. Generated
  files remain inaccessible until the report, file and notification commit.
  Failed or cancelled uploads have durable cleanup; successful publication is
  preserved even if its commit response is lost.
- Added progress, automatic status refresh, filtering, stable pagination,
  cancellation, retry, private JSON/PDF downloads and explicit error/loading/empty
  states. Dates and entered fields survive validation failure. Reports distinguish
  recorded manual/real provider contact from draft or simulated work.
- Eleven migrations applied to integration and browser schemas. Typecheck, lint,
  formatting, production compilation and 349 unit/component tests passed. Eight
  new report integration tests passed, followed by 24 report/evidence/erasure/
  notification regressions. Coverage includes atomic enqueue failure, concurrent
  submissions, foreign privileged access, 10,002 requests, stale leases, storage
  failure/retry and account/profile deletion during storage.
- The production Chromium correspondence journey now includes a completed request,
  invalid/valid report input, leased generation, private download and ready
  notification. See `docs/reports.md` for semantics and recovery. In-memory final
  rendering remains a documented performance measurement target, alongside the
  rest of the approved implementation scope.

### Complete account exports

- Added explicit masked and separately confirmed sensitive exports covering 24
  record categories. Queries use ownership-scoped pages with no silent row cap;
  credentials, tokens, blind indexes and storage keys are excluded. File contents
  remain separate private downloads, described in the export manifest and UI.
- Export requests and jobs commit atomically. Generation and publication check
  the active account, current consent proof and worker lease. Sensitive copies
  use encrypted temporary storage, expire after 24 hours, and remain unavailable
  until publication commits. Lost publication responses preserve completed files.
- Added generation progress, errors, private downloads, cancellation/deletion and
  stable pagination. Erasing identifiers, profiles, replies or evidence also
  invalidates derived copies and queued exports. The original masked download
  endpoint now covers the same complete record categories.
- Twelve migrations applied to integration and browser schemas. Typecheck, lint,
  formatting, production compilation, all 349 unit/component tests and all 149
  integration tests passed. Twelve export regressions cover atomic failures,
  competing submissions, ownership, masking, encryption, expiry, stale leases,
  content erasure, deferred publication and pagination. All three Chromium
  journeys passed, including sensitive confirmation, generation, download and
  deletion against the production build with external sending disabled.
- See `docs/account-exports.md` and the upgrade guide. Final artifact assembly is
  still in memory and remains a performance measurement target. Follow-up and
  blocked-send recovery, operator tools, legal coverage, full interface polish,
  production verification and the final PR remain in progress.

### Follow-up and blocked-dispatch recovery

- A regression reproduced the deadline watch leaving a queued follow-up in
  `NO_RESPONSE`, where its worker skipped it. Scheduling now commits status,
  preparation, reminder and notification together and records `nextFollowUpAt`.
  Initial reminders use the recorded response date; follow-up spacing also
  respects the last submission. Existing stranded `NO_RESPONSE` rows are eligible
  for recovery. Cap exhaustion suggests review without filing an escalation.
- Follow-up preparation, deadline warnings and recheck reminders now fence their
  worker leases at publication. Cancelled or failed preparation can be retried
  without duplicate drafts, and the request screen shows pending/failed states.
- Changed consent, contact or sending configuration stops a queued attempt with
  an actionable timeline entry and notification. Fresh approval is required.
  Uncertain provider attempts remain in reconciliation. An expired worker that
  died during dispatch is also visible; reconciliation serializes with job claims.
- All 349 unit/component tests passed. The full integration run passed the 151
  other cases; all 10 follow-up regressions passed after correcting a fixture to
  respect the database's consent constraint. Typecheck, lint, formatting and
  production compilation passed. The production Chromium journey passed failed
  preparation, retry, fresh approval and manual follow-up submission, then reply,
  report and private export. See `docs/follow-up-recovery.md`.
- The browser check also found that an explicit broker selection could disappear
  behind the cached directory. Selected IDs are now loaded directly, and the
  additional 60-row truncation was removed. Full directory pagination remains in
  the UI pass.
- Contextual final reminders/escalation, completed-onboarding checks, current
  contact selection when regenerating follow-ups, legal deadlines and immutable
  catalogue versions remain next. Also correct sandbox redirects being counted
  as real broker contact in reports. Operator tools, interface/production/
  performance work and PR delivery remain open.

### Published catalogue history

- Database guards now preserve published legal/template content and parent scope.
  Seed changes append versions, retain operator choices, and never revive retired
  text after a rollback. Operator-managed entries receive new seed content as
  drafts. Applicable rule selection excludes inactive, future and expired content.
- Added history, scope, effective-date and concurrent seed regression tests. The
  concurrency test reproduced a first-install upsert race; per-parent transaction
  locks now cover creation as well as version allocation. See
  `docs/catalogue-versions.md` for upgrade behavior.
- All 19 catalogue/seed/generation integration checks, type checking, lint and
  formatting passed. Migration 13 applied successfully to both isolated test
  schemas. Operator authoring and publication are still to be implemented.

### Request entry and setup consent

- Incomplete self-profile setup now blocks rendering, atomic draft creation,
  approval and dispatch through the shared consent gate. Regression tests first
  reproduced the bypass. Workflow fixtures now complete real transactional setup
  and retain its consent proof; erasure/export tests include the resulting records.
- Initial generation validates its domain boundary and rejects follow-up, final
  reminder and escalation types. The new-request form shows only initial types
  supported by both published rules and templates. It preserves checked values
  after validation, links duplicate submissions to owned existing requests, and
  makes broker search and identifier errors accessible. Profile and legal context
  use headings and a disclosure instead of repeated bordered cards.
- Production compilation and all 349 unit/component tests passed. Integration
  ran 170 cases; 168 passed on the full run and the two fixture-count assertions
  passed in an 11-case targeted rerun after accounting for actual setup records.
  All three production Chromium journeys passed, including unfinished setup,
  preserved selections, duplicate navigation, sign-out and household consent.
  External sending remains disabled. The final full-suite run will repeat these
  checks after the remaining features and interface work.

### Final reminders and escalation preparation

- Final reminders now require a recorded follow-up, retain their kind through
  retries and regeneration, and require fresh approval. Lease fencing verifies
  the requested kind. A submitted final reminder ends automatic follow-ups even
  when an operator raises the ordinary reminder cap. Regeneration selects the
  current active contact while preserving every historical approved envelope.
- Added owner-only escalation preparation and a private text summary. Preparation
  cancels queued reminders atomically, checks current consent and unresolved
  delivery, and makes clear that no complaint or authority contact occurred.
  Summaries distinguish real, manual and simulated contact and exclude personal
  identifiers and message contents. Reports also exclude sandbox delivery from
  real broker-contact counts.
- Seed template revisions remove blank deadline labels, unsupported assumptions
  that no reply arrived, and wording that conflated the sender with the represented
  adult. Published historical versions remain unchanged.
- All 351 unit/component tests, typecheck, lint, formatting and production build
  passed. Targeted generation/editing/follow-up checks and all 24 follow-up-action,
  recovery and report integration cases passed; the final 13-case reminder rerun
  also passed after adding cap and terminal-reminder checks. The production browser
  journey passed final approval, manual submission, partial reply, escalation,
  completion, reporting and export with external sending disabled. Operator tools,
  sourced coverage, interface, production and performance work remain in progress.

### Broker curation and operational settings

- Added broker creation/editing, verified contact evidence, explicit jurisdiction
  and request-type coverage, and a separate sending toggle. Every catalogue edit
  disables that broker's sending until its final configuration is reviewed. Live
  generation, approval and dispatch enforce compatibility and manual-review flags.
  Public broker detail pages expose sources and manual verification instructions.
- Operator writes validate purpose-specific commands, lock the active account and
  target, reject stale revisions, and bind child records to their broker. Seed
  upgrades preserve operator edits. Settings now have typed editors, validation,
  defaults, conflict detection and cache invalidation; sensitive rows stay private.
  Admin repositories enforce roles and job lists no longer retrieve payloads.
- All 357 unit/component tests and 47 targeted integration cases passed. The final
  eight-case operator integration rerun also passed after checking legacy sensitive
  settings and maximum-length broker names. Typecheck, lint, formatting and the
  fresh production build passed. All six production Chromium journeys passed,
  including the new broker and settings workflow, with external sending disabled.
  Template/legal authoring, coverage, interface and production/performance work
  remain in progress.

### Template authoring and publication

- Added searchable, paginated template administration, metadata editing, draft
  creation and repair, a canonical variable reference, saved synthetic self and
  household previews, review validation, publication and deactivation. Published
  versions retain immutable content; corrections create new drafts and historical
  request snapshots retain their approved text and version references.
- Operator writes use active-account gates, revision checks, bound version IDs and
  saved-source checksums. Publication serializes each request-type/channel/scope,
  supersedes the parent's previous version and deactivates competing parents in
  one transaction. Seeds preserve published custom choices even on first install.
- Initial and follow-up rendering now select templates by the actual delivery
  channel, prefer jurisdiction-specific language and share a plain-letter fallback
  for manual channels. Bulk preparation reuses each channel lookup. A destination
  change after rendering rejects generation, regeneration or follow-up publication
  before a new snapshot can be committed. New editor text normalizes CRLF/CR to LF;
  the production browser journey caught that browser form encoding difference.
- All 374 unit/component tests, 52 targeted workflow/catalogue integration cases,
  and the final nine-case operator rerun passed. Typecheck, lint, formatting and a
  fresh production build passed. All seven production Chromium journeys passed,
  including the new draft/validation/preview/publication/supersession workflow.
  Browser fixtures reset only the login-IP bucket in the guarded local test
  database so repeated QA does not consume the application's production limit.
  Legal authoring, sourced coverage, interface, production, performance and final
  PR delivery remain in progress.

### Interface refinement and production browser policy

- Reworked the shared mobile shell, control sizing, spacing/radius tokens,
  headings, table/tab scroll regions, inline states and focus restoration while
  retaining the blue/slate identity and navigation. Dashboard attention comes
  first, with four primary summaries, a complete detailed breakdown and real
  ownership-scoped aggregate counts. Letters have a readable, explicit reveal.
- Evidence uploads retain selected files and values on failure, reject generated
  file kinds at the service boundary, show unassigned stored files under profile
  filters, and use reliable private download anchors. Review/edit controls now
  reflect request eligibility. Deletion copy describes immediate blocking and
  resumable cleanup accurately.
- Root HTML and 404 metadata use runtime rendering and document nonces. Production
  builds always enforce strict script CSP; permitted control style attributes
  and nonced Radix scroll-lock styles no longer trigger violations. Shared
  household/notification copy is separate from server validation. CI checks CSP,
  hydration and console errors on every browser journey. Removed fabricated
  sitemap timestamps and included the new private routes in crawl/proxy rules.
- Captured all 41 interface routes at five widths: 205 captures, zero page
  overflow, one H1 per screen, zero unnamed controls and zero axe AA findings at
  375px. Keyboard and 200% zoom approximations also pass. Before/after images and
  methods are in `docs/interface-verification.md`. Public JavaScript encoded
  transfer fell from 190,430 to 156,202 bytes (18.0%) over three cold runs, without
  removing public content or FAQ behavior.
- Typecheck, lint, formatting, all 379 unit/component tests, nine targeted
  dashboard/evidence integration cases, the production build and all nine
  production browser journeys passed. Auditing reports zero dependency
  vulnerabilities after compatible updates to affected development packages.
  Sourced legal coverage, legal authoring, remaining pagination, operational
  hardening, scale benchmarks and final PR/CI delivery are still in progress.

### Receipt-based response targets

- Added versioned, sourced timing policies for calendar months, calendar days,
  business days and no fixed period. GDPR uses one calendar month; missing
  public-holiday coverage stays visibly estimated. Drafts do not start a clock.
  The first submitted snapshot pins the original policy and submission date;
  follow-ups and late delivery events preserve that original clock.
- Owners can record or correct an actual original receipt date after real
  submission. Ownership, date bounds and concurrent revisions are checked, and
  clock changes and history commit together. Mock or sandbox delivery cannot
  become a real receipt. Reports, exports, reminders and escalation summaries
  include timing provenance. Extensions and verification pauses remain disclosed
  policy conditions and are not applied automatically.
- Deadline workers page past failed rows rather than repeating the first batch.
  Warning deduplication follows the current target so a corrected receipt can
  receive a new warning. Account and profile erasure clear the clock fields.
- The additive migration preserves sent dates, snapshot IDs and approved text,
  labels existing deadlines as legacy estimates, and clears unsent deadlines.
  An isolated first-thirteen-migrations upgrade and repeat-deployment rehearsal
  passed. Upgrade and rollback boundaries are in `docs/response-targets.md`.
- All 387 unit/component tests passed. Related generation, approval, manual
  submission, erasure, report, export, dashboard and seed checks passed; the final
  23 response-target/delivery/follow-up integration cases and the migration
  rehearsal passed. Typecheck, lint, formatting, a production build and all nine
  production browser journeys passed, including original receipt recording.
  Legal authoring, sourced coverage, remaining pagination, operational hardening,
  scale benchmarks and final PR/CI delivery remain in progress.

### Complete private histories and recoverable actions

- Request events, manual submissions and attachment choices now use complete,
  ownership-scoped pages. Search and selection preserve entered correspondence;
  expired and ineligible files cannot become attachments. Audited privileged
  reads receive only a minimized operational summary, never private content.
- Invalid list filters display a local explanation and a reset link. Foreign
  private routes return an actual HTTP 404, one meaningful heading and one main
  landmark. Navigation keeps a visible pending state without committing streaming
  headers before ownership checks. Browser validation exposed Zod's optional JIT
  probe under strict CSP; browser schemas now use its supported non-JIT mode.
- Damaged reminder jobs require an explicit preparation choice. The deadline
  watcher checkpoints its bounded scan under the current lease, so large backlogs
  and failed records cannot prevent later records from receiving attention.
  Correcting receipt cancels obsolete proven automatic work and preserves manual
  choices and approved history. Migration backfills require conservative proof
  and do not infer a corrected clock from an older system event.
- The complete suites passed 456 unit/component tests, 271 integration tests and
  14 production browser journeys before the final scale/source additions. All
  240 route/viewport captures passed alignment, overflow, labels, headings,
  accessibility, CSP and browser-error checks. Additional final verification is
  underway for the bounded export/index changes and future-law drafts.
- Security contact output now uses RFC 3339 expiry and refuses to publish an
  example address. UK timing notes cite the current ICO guidance and enacted
  commencement/transitional provisions. Alabama, Louisiana and Oklahoma future
  statutory rules and letters remain unpublished drafts; voluntary workflows
  stay available without an invented statutory deadline.

### Measured scale and final privacy review

- The isolated 100/1,000/10,000-request benchmarks verify complete reports and
  masked exports, response sizes, query counts, p50/p95 latency, memory and
  fenced worker throughput. At 10,000 requests, bounded history returns roughly
  12 kB rather than 5 MB. Masked export generation keeps identical output and
  falls from 10.1 to 5.1 seconds, with 2,335→1,014 queries. Larger internal batches
  and omission of unused private fields preserve every record and confirmed
  sensitive exports. The ownership/time/id index and exact cursor upper bound
  improve all three large-page comparison rounds. See `docs/performance.md` for
  raw evidence, slower results and measurement limits.
- A second report index did not show a consistent benefit and is not added.
  Stable paged audit verification and explicit private authorization cost extra
  queries; those correctness guarantees are retained. Existing multiple-worker
  operation is measured; no speculative intra-worker concurrency is introduced.
- New failure-first regressions reproduced operator summaries retaining legacy
  profile notes and stale actors revealing identifiers after deletion scheduling.
  Reads now check active ownership before fetching private fields, operator
  summaries select only operational metadata, and identifier reveal requires
  successful audit recording. Pending erasure blocks these reads immediately.
- Final delivery checks, Docker restore validation and the reviewable PR with
  registered thread linkage and verified CI remain underway.

### Legal-rule authoring and current operator authority

- Added searchable, jurisdiction-filtered legal administration with stable
  pagination, inactive draft creation, metadata editing, sourced timing and
  applicability, saved synthetic previews, publication, scheduling and history.
  Published content stays immutable; malformed legacy timing must be repaired
  from a source rather than inferred from an old day count. Saved configuration
  hashes and revision checks bind publication to the reviewed version.
- Publication and supersession commit atomically. Future versions leave the
  currently applicable version available until their effective time. A regression
  reproduced publication reviving a withdrawn predecessor; publication from an
  inactive rule now retires those older versions and waits for the successor's
  effective time. Expiry does not revive superseded law.
- Privileged writes recheck the stored role under the active-account lock.
  Regressions first reproduced stale operator authority after demotion; broker,
  template, legal, settings, job-control and emergency-access writes now use that
  current authority. Trusted internal worker job controls keep their system path.
- Typecheck, lint, formatting, all 393 unit/component tests and nine legal-rule
  integration cases passed. Related operator/worker and immutable-seed checks
  passed across targeted runs. A fresh production build and all ten Chromium
  journeys passed; the legal journey passed again after the scheduling correction.
  The interface review now covers 48 routes and 240 captures with no overflow,
  heading, label, CSP or axe AA defects. All 101 keyboard/zoom-approximation checks
  passed. See `docs/interface-verification.md` and `docs/operator-catalogue.md`.
- Sourced country/state coverage, remaining pagination, operational hardening,
  scale benchmarks, full delivery verification and the PR/CI remain in progress.

### Explicit EU/EEA coverage

- Added distinct packs for all 27 EU countries and Iceland, Liechtenstein and
  Norway, generated from the shared reviewed GDPR definitions with each country's
  authority information. German keys and historical versions stay intact. EEA
  EFTA commencement uses 2018-07-20; the EU baseline uses 2018-05-25. National
  exceptions and holiday calendars remain explicit review requirements.
- Resolution now prefers exact country/state records and never borrows Germany's
  authority for missing packs. Regressions first reproduced that fallback and
  the US resolver ignoring an existing state pack. Unsupported US locations are
  labelled voluntary; state-specific content follows in the next coverage batch.
- All 425 unit/component tests pass, including every applicable seeded
  rule/template rendering combination. The 24 seed/history/generation integration
  checks pass. A separate complete-workflow matrix passes 210 journeys: all seven
  initial GDPR request types in all 30 countries, through approval, manual
  submission, user-confirmed correspondence and a complete downloadable report.
  It records no outbound email. Its initial fixture used a null sender where the
  boundary requires a string; the corrected matrix passes.
- Typecheck, lint and formatting pass. No new route or migration is introduced.
  The final production/browser coverage run will include the expanded catalogue
  after US packs, future-law corrections and sourced broker entries are complete.
  Remaining operational, pagination, benchmark and PR work stays in scope.

### Platform channels, sourced broker drafts and regional timing

- Legal applicability now includes the actual submission channel. California
  DROP uses its own manual platform instructions and never borrows a letter's
  response clock. Follow-ups use the current applicable rule while keeping the
  original submitted message and timing policy pinned. A complete production
  browser journey records only a synthetic local platform submission.
- Added sourced Epsilon, LiveRamp and PeopleConnect catalogue drafts. Every
  entry starts disabled and unverified. Repeat seeds preserve operator choices;
  PeopleConnect suppression stays distinct from deleting a website account.
- Corrected Brazil's access-only complete-declaration period, Australia's
  private-organisation reasonable-period guidance and Singapore's 30-day delay
  notification. No completion period is invented for the other rights. Seed
  updates append versions and preserve the policy and text of historical drafts.
- The full coverage matrix now passes 338 journeys across the 30 EU/EEA countries,
  20 US states, unsupported-state and current India requests, the UK, Brazil,
  Australia and Singapore. Each reaches approval, manual submission, confirmed
  response and a complete report, with zero outbound messages. Forty related
  generation, receipt, report and immutable-seed integration cases pass.
- Reusing the calendar formatter within each boundary calculation removes
  repeated ICU setup. DST, skipped-date, repeated-midnight and lower-year tests
  pass. A legacy invalid timezone now records an explanatory missing target
  rather than disrupting a delivery update. Reproducible measurements and their
  limits are in `docs/performance.md`.

### Complete list access and current toolchain

- Requests, evidence, broker discovery, jobs and audit entries use stable pages
  of 25 rows, with validated filters and a maximum page size of 100. Purpose-specific
  projections omit profile ciphertext, file keys, operational payloads and audit
  metadata. Cross-account filters cannot reveal records. Expired evidence remains
  visible for cleanup and explains why downloading is unavailable.
- Broker choices remain selected while searching and paging, and an evidence
  attachment's selected request remains available beyond the current page. All 12
  production browser journeys pass, including those interactions. Error screens can reopen
  the current route without malformed filters.
- Updated Next.js and its matching ESLint package to 16.3.8 after verifying the
  new upstream ImageResponse advisory; compatible brace-expansion patches resolve
  the remaining advisories. The complete dependency audit now reports zero
  vulnerabilities. Removed the unused Prisma auth adapter and path-resolution
  plugin; Vitest uses native path resolution and an ESM configuration, and Prisma
  uses its supported configuration file. Worker entry points load local `.env`
  explicitly; production dependencies include that loader.
- Type checking, lint, formatting, all 443 unit/component tests and 23 related
  list-access, evidence, operator-access and immutable-seed integration tests pass.
  Prisma validation passes with the dedicated test database URL. Deployment
  packaging, operational monitoring, remaining detail histories, scale benchmarks,
  final production/browser verification and PR/CI delivery remain in progress.

### Separate production runtimes

- Docker has separate non-root app, worker and migration targets. The standalone
  app excludes development tools; the worker installs production dependencies;
  the migration target installs only its pinned CLI dependencies. Shared writable
  volumes make locally stored encrypted objects available to both runtimes.
- The first disposable smoke test passed migration, real background generation,
  authenticated evidence/report/export downloads and ciphertext checks. The second
  run also passed sensitive-export decryption/masking, runtime metadata and strict
  production script protection checks, with no development tools in the app.
  CI now runs this smoke test and dependency auditing. See
  `docs/production-deployment.md` for configuration and storage requirements.

### Worker monitoring and background audit checks

- Added a process-specific database heartbeat, including idle work, graceful stop
  and Docker health probes. Operator pages and metrics expose due queue age,
  expired leases, uncertain delivery, pending account erasure and file purges
  without private job payloads. Future scheduled work does not inflate queue age.
- Audit verification runs daily or on request, in bounded pages over a stable
  read-only database snapshot. The page shows the last complete result and queue
  state. Publication is lease fenced, current operator authority is rechecked,
  and duplicate clicks reuse the same active job.
- A regression reproduced retention deleting a middle audit row when timestamps
  are out of order. Cleanup now removes only a contiguous prefix and displays
  its retained anchor. Hash formats and existing historical rows are unchanged.
- Typecheck, lint and all 446 unit/component tests pass. Thirty integration
  checks pass across monitoring, multi-page verification, tampering, concurrent
  appends, retained anchors, stale leases and list access. Twenty-nine additional
  targeted checks pass after the restore rehearsal exposed unnecessary account
  file tombstones; final cleanup removes their keys/checksums and fair-use counters.
- All 13 production browser journeys pass. All 240 captures and
  101 keyboard/zoom-approximation checks pass. The Docker rehearsal restores an
  actual database/object backup to a second disposable database, reapplies
  migrations, verifies downloads and resumes pending deletion. See
  `docs/backup-and-recovery.md`. Remaining detail histories, recovery paths,
  scale benchmarks, final complete verification and PR/CI remain in progress.
