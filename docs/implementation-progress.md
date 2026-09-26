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

- [ ] Regression coverage, seeded rendering, sign-out, public invitations,
      dependency advisories.
- [ ] Versioned encryption, encrypted authentication lookup, strict key
      validation, safe uploads/downloads, recoverable object deletion.
- [ ] Immediate account access blocking and resumable erasure; equivalent
      profile/identifier deletion; minimal audit/consent proof retention.
- [ ] Focused request services, ownership boundaries, atomic generation/quota
      and approval/outbox, complete approval envelopes, dispatch revalidation.
- [ ] Fenced job leases, heartbeats, cancellation and ambiguous-send recovery.
- [ ] Resumable onboarding and profile editing; complete household consent.
- [ ] Draft editing, contextual follow-ups, manual submissions, responses,
      verification, closure and recovery actions.
- [ ] Notifications/preferences, reports and masked/sensitive exports.
- [ ] Operator catalogue and immutable legal/template publication, settings.
- [ ] Sourced EU/EEA and US state packs, correct deadlines, disabled real
      broker drafts and inactive future law versions.
- [ ] Shared UI tokens, responsive shell, readable review, useful dashboard,
      accessible paginated tables and complete interaction states.
- [ ] Runtime metadata, strict CSP, Docker roles/storage, operational health,
      backup/restore and upgrade documentation.
- [ ] Measured performance comparisons; retain only demonstrated safe wins.
- [ ] Migration/recovery rehearsals, ownership/concurrency/encryption tests,
      real browser journeys, all screen sizes, accessibility and production QA.
- [ ] Coherent commits, reviewable PR, T3 registration and passing CI.

## Migration commitments

Use additive schema changes and resumable backfills, verify counts and hashes,
preserve historical snapshot IDs and content hashes, and reject legacy queued
approvals that cannot prove their full envelope. Retain sent history. Do not
claim completion of a purge until storage deletion succeeds. Document key
requirements, maintenance and rollback boundaries in the upgrade guide.

## Verification log

New validation results are recorded here as the corresponding work is completed.
The original audit screenshots were lost when the temporary environment reset.
Recreate the baseline from the base commit in an isolated checkout for the final
visual comparison. This checklist is a work log, not a claim that unchecked
features are implemented.

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
