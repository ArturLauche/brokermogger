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
Baseline screenshots are retained outside the source tree until the final visual
comparison is captured. This checklist is a work log, not a claim that unchecked
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
- Typecheck, lint and format passed; 320 unit/component tests passed. Five new
  generation integration tests passed, including injected storage failure and
  concurrent generation. Actual browser sign-out remains in the final journey pass.
