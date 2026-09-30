# Response targets and recorded receipts

Draft creation and approval do not start a response period. The first recorded
manual submission or accepted email starts the clock, using the legal version
bound to that submitted snapshot. Follow-ups preserve that original clock and
the first submission timestamp. Later reminder spacing uses the most recent
submitted follow-up, including a manually recorded date.

The executable policy distinguishes calendar days, calendar months, business
days and no fixed period. Month arithmetic uses the corresponding calendar
date, clamped to the final day of a shorter month. A sourced policy can move a
non-working final day forward. Business-day calendars declare their coverage,
holidays, non-working weekdays, source and actual review date. Missing or
incomplete coverage produces an explicitly estimated target; it is never
silently treated as a verified calendar.

Timing sources reviewed on 2026-09-30:

- [EDPB Guidelines 01/2022, paragraphs 157–161](https://www.edpb.europa.eu/system/files/documents/2023-04/edpb_guidelines_202201_data_subject_rights_access_v2_en.pdf):
  one calendar month from receipt, with month-end and non-working-day rules.
- [ICO response guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-of-access/what-should-we-consider-when-responding-to-a-request/):
  calendar-month calculation and conditional extensions or pauses, including
  changes under the Data (Use and Access) Act.
- [California Attorney General CCPA FAQs](https://oag.ca.gov/privacy/ccpa):
  45 calendar days for access, deletion and correction; 15 business days for
  sale or sharing opt-out. Eligibility and exemptions still require review.

Extensions and verification or clarification pauses are recorded in policy
conditions but are **not applied automatically**. The displayed date remains
the baseline response target; users should review any broker notice. No seed
claims verified public-holiday coverage for an entire country or state.

## Provenance and display

`deadlineOn` is the inclusive date shown to the user. `deadlineAt` is the first
instant after that day in the recorded account timezone, so reminder checks
respect short and long DST days. This is an operational cutoff; the broker's
applicable timezone or receipt rules may differ. Reports, exports and escalation
summaries carry the date's provenance and estimate flag.

The basis is one of recorded receipt, dispatch estimate, provider-delivery
estimate, simulated dispatch or legacy estimate. Provider delivery does not
prove broker receipt. Mock and sandbox messages cannot be recorded as real
broker receipts.

After an actual submission, **Record original receipt date** lets the owner use
a broker acknowledgement or postal receipt. A correction preserves approved
text, checks ownership and date boundaries, rejects stale concurrent edits, and
appends history in the same transaction as the clock. It uses the original
submitted snapshot, even after a follow-up exists. Account, profile and
identifier erasure remove these dates, their snapshot link and correction trail.

A changed original receipt date cancels only preparation proven to have been
scheduled automatically for the old response target, plus its obsolete recheck.
It fences a running attempt and clears warning/handled markers so the new target
can be processed. Explicitly requested reminder preparation survives the
correction. A future corrected target can return an overdue request to waiting;
approved text and previously submitted messages remain unchanged.

## Upgrade

1. Keep external sending disabled. Pause app and worker writes and take the
   database/storage backup described in `upgrade-private-storage.md`.
2. Run `npm run db:deploy`, generate the matching Prisma client and deploy the
   matching app and worker together. The additive migration is
   `20260930010000_response_targets`.
3. Run `npm run db:seed` to append the reviewed timing revisions. Seeds preserve
   published historical versions and operator-maintained choices. An existing
   approved message keeps its original legal version; an invalid or legacy
   policy is not guessed from its old day count.
4. Check sent history, newly recorded submission, receipt correction and worker
   reminders before enabling any production sending switches.

The migration preserves existing sent timestamps, snapshot IDs, approved text
and existing legacy deadlines. It labels those deadlines as estimates and
clears accidental deadlines on unsent requests. It does not rewrite old
approvals or infer receipt. The integration rehearsal deploys the first thirteen
migrations to an isolated schema, installs synthetic sent and draft history,
applies this migration, verifies content and counts, then re-enters deployment.

The old application does not understand the new provenance or inclusive-date
fields. Keep sending and reminder processing paused during a rollback; review
the database backup and migration boundaries before resuming an older version.

`20260930030000_deadline_recovery` adds target-specific handled markers and
backfills automatic-preparation provenance only where the latest request event
is system scheduling to `FOLLOW_UP_SCHEDULED`, and job ownership and reminder
sequence prove the relationship. Manual choices, final reminders and later
correction/delivery events are not relabelled. Deploy the matching worker before
resuming reminders. A separate disposable-schema rehearsal verifies those cases,
the stronger audit-result constraint and a repeated deployment.

`20261001010000_request_page_index` adds the ownership/time/id index for request
pages. Apply it in the same maintenance window: ordinary index creation can
block request writes while building. It changes neither historical content nor
request visibility. The matching cursor retains the exact timestamp/id ordering
and page boundaries.
