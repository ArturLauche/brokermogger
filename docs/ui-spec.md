# Brokermogger UI specification

This document is the contract for every screen. Implement the named components,
labels, states and audit events. Do not invent a second vocabulary.

Shared conventions apply to every authenticated screen unless a screen section
overrides them.

## Shared conventions

### Shell

Authenticated screens render inside `AppShell` from
`components/layout/app-shell.tsx`. The shell provides a skip link, a sidebar
(collapsing into a `Sheet` below `md`), the `ProfileSwitcher`, the `UserMenu`
and a `main#region` with `id="main-content"`. Real authorization is server
side. Hiding a nav item is never enough.

### Components

Use shadcn/ui primitives from `components/ui` and the product components from
`components/common`. Typical pairing:

- Page title: `PageHeader` (exactly one `h1`).
- Empty: `EmptyState`.
- Loading: `LoadingState` or `CardSkeleton` / `TableSkeleton` / `ListSkeleton`
  with `role="status"` and an sr-only "Loading".
- Error: `ErrorState` with a retry action and a machine readable error code.
- Status: `StatusBadge`. Status is never colour alone; always the label text
  plus a distinct icon.
- Identifiers: `MaskedValue`. Full values appear only after "Show".
- Collected fields: `WhyWeAsk` next to the label.
- Tables: `DataTable` with a caption, sortable `th` (`aria-sort`), empty and
  loading states.
- Destructive actions: `ConfirmDialog`. Account deletion and similar require a
  typed confirmation phrase.
- Toasts: `sonner`. Success and failure of mutations. Do not toast secrets.
- External URLs: `ExternalLink` (`rel="noreferrer noopener"` plus "opens in a
  new tab").
- Summary pairs: `DefinitionList`.

### Forms

Every input has a visible label. Description and error are referenced with
`aria-describedby`. `aria-invalid` is set when there is an error. Errors use
the field's words, not a dump of Zod paths. Submit buttons name the action
("Save profile", not "Submit").

### Masking

Show masked previews in lists, tables, notifications and admin views. Reveal is
an explicit action and writes `identifier.revealed` when a stored identifier is
shown. Identity documents are never inlined; they are downloaded through an
authorised route.

### Toasts

- Success: short past tense ("Request approved.").
- Error: what happened and what to do ("The request could not be sent. Nothing
  left the instance.").
- No auto-dismiss for errors that need an action.

### Destructive confirmation

Default: `ConfirmDialog` with a consequence list. Account deletion and profile
deletion require typing `DELETE`. The confirm button stays disabled until the
phrase matches exactly.

### Focus

Dialogs trap focus, restore it on close, and start on Cancel for destructive
actions. After a successful mutation, move focus to the resulting heading or
status alert.

### Fair use

When a fair use limit is reached, show an `Alert` that names the limit, the
window and that it is operational, not a paid upgrade.

---

## Public screens

### Landing

- **Route:** `/`
- **Purpose:** Explain what the product does without fear marketing.
- **Primary goal:** Decide whether to create an account or sign in.
- **Visible:** `PublicHeader`, `Hero`, `HowItWorks`, `CountryCoverage`,
  `WhyItMatters`, `Limitations`, `SecurityPrinciples`, `FreeAccess`,
  `OpenSource`, `SelfHosting`, `Faq` (`Accordion`), `ClosingCta`,
  `PublicFooter`. Buttons: "Create an account" and "Log in" both go to
  `/login`.
- **Empty / loading / error / success:** Static server page. `app/error.tsx`
  and `app/not-found.tsx` cover failures.
- **Validation:** None.
- **Accessibility:** Landmarks (`header`, `nav`, `main`, `footer`), one `h1`,
  sequential headings, usable without JavaScript except the FAQ accordion.
- **Audit:** None.

### Sign in

- **Route:** `/login`
- **Purpose:** Request a magic link.
- **Primary goal:** Receive a one time sign in link.
- **Visible:** `h1` "Sign in to Brokermogger". `Card` titled "Email address".
  `FieldLabel` "Your email address". `Input` `type="email"` `name="email"`.
  `FieldDescription` "We only use this address to sign you in and to reply
  about your requests." `Button` "Send me a sign in link". Link "Back to the
  start page".
- **Empty:** Form ready.
- **Loading:** Native submit pending state.
- **Error:** `?error=invalid_email` linked with `aria-describedby`.
- **Success:** Redirect to `/login/check-email`.
- **Validation:** `z.email().max(254)`, lowercased. Invalid stays on `/login`.
- **Accessibility:** Label, description and error wired to the input. Works
  without JavaScript.
- **Audit:** `auth.magic_link.requested` or `auth.magic_link.rate_limited`.
  Always redirect to check-email so the response cannot enumerate accounts.

### Magic link sent

- **Route:** `/login/check-email`
- **Purpose:** Explain the next step without revealing whether the address is
  known.
- **Primary goal:** Open the mailbox and use the link.
- **Visible:** `h1` "Check your email". Body states that a link was sent if the
  address is known, names the lifetime in minutes, links to `/login`. In
  development only, an `Alert` mentions that mock mail is written to
  `MOCK_EMAIL_DIR`.
- **States:** Static. No form.
- **Accessibility:** One `h1`, no timed redirect.
- **Audit:** None on this page.

### Auth error

- **Route:** `/login/error`
- **Purpose:** Explain expired, reused, denied and configuration failures.
- **Primary goal:** Request a new link or contact the operator.
- **Visible:** `h1` matching the case. Cases: `Verification` ("This sign in
  link has already been used or has expired."), `AccessDenied` ("This account
  is not available."), `Configuration` ("This instance is not configured for
  sign in."), unknown. `Button` "Request a new link" to `/login`.
- **Accessibility:** Error text is not colour-only.
- **Audit:** None on this page (the failed attempt was already recorded).

---

## Authenticated screens

All of the following assume `requireActorOrRedirect()` in the layout. The
active profile comes from the profile switcher (cookie or query
`?profile=`).

### Dashboard

- **Route:** `/dashboard`
- **Purpose:** Show the current state of the signed in account for the active
  profile.
- **Primary goal:** See what needs action and start a new workflow.
- **Visible:**
  - `PageHeader` title "Dashboard", description names the active profile.
  - `ProfileSwitcher` in the shell.
  - Primary `Button` labelled exactly **Start new removal workflow**, linking
    to `/requests/new`.
  - Metric `StatCard` tiles, in this order:
    1. Total brokers selected
    2. Requests prepared
    3. Requests awaiting approval
    4. Requests approved
    5. Requests sent
    6. Requests completed
    7. Requests awaiting broker response
    8. Requests needing user action
    9. Upcoming deadlines
  - `Card` "Recent activity" with `Timeline`.
  - `Card` "Exposure reduction estimate" with the word **estimate** in the
    title and a footnote that this is not a measurement of remaining copies.
  - `Card` "Fair use" showing used/limit for the day and month, with an
    explanation that limits are operational.
- **Empty:** Zero tiles show `0`. Recent activity uses `EmptyState` title "No
  activity yet" and the start button.
- **Loading:** `CardSkeleton` grid.
- **Error:** `ErrorState` code `DASHBOARD_LOAD_FAILED`.
- **Success:** Numbers for the active profile.
- **Validation:** None.
- **Accessibility:** Each `StatCard` is labelled by its title. Upcoming
  deadlines is a list of links, not colour-only urgency.
- **Audit:** None for a normal view.

### Onboarding wizard

- **Route:** `/onboarding`
- **Purpose:** Collect a primary self profile progressively.
- **Primary goal:** Create a complete, minimised self profile.
- **Visible:** `PageHeader` "Set up your profile". `Progress` "Step n of 5".
  `Tabs` or numbered steps. Each field has `WhyWeAsk`. Date of birth,
  government ID, biometrics and children's data are not collected.

#### Step 1 — Basic profile

Fields:

| Label                  | Name                 | Required        | Validation                | Why we ask                              |
| ---------------------- | -------------------- | --------------- | ------------------------- | --------------------------------------- |
| Full name              | `fullName`           | yes             | 2–120 chars, no newlines  | Matching and the letter greeting        |
| Email                  | `email`              | yes             | email, max 254            | Reply address for brokers               |
| Country                | `country`            | yes             | ISO 3166-1 alpha-2 select | Chooses the jurisdiction pack           |
| State or region        | `region`             | required for US | 2–80 chars                | California vs other United States       |
| I live in this country | `residencyConfirmed` | yes             | must be checked           | Confirms residency used for legal rules |

Primary button: "Continue to matching identifiers".

#### Step 2 — Matching identifiers

Repeatable rows (add/remove). All optional.

| Label                      | Type  | Validation               | Why we ask                            |
| -------------------------- | ----- | ------------------------ | ------------------------------------- |
| Previous names             | text  | max 120                  | Brokers may still list an old name    |
| Additional email addresses | email | email                    | Brokers often key off extra addresses |
| Phone numbers              | tel   | 5–20 digits after strip  | People-search matching                |
| Approximate location       | text  | max 80, city/region only | Narrows directory matches             |

Primary button: "Continue to address details".

#### Step 3 — Address details

Postal address and previous addresses. Shown as optional unless the selected
jurisdiction or later broker selection marks them required. Street, city,
region, postal code, country. Why we ask: some property and people-search
brokers match on address; skip if you do not want that matching.

Primary button: "Continue".

#### Step 4 — Sensitive verification

`Alert`: identity documents are not collected by default. The upload `Input
type="file"` is disabled with helper text "Not required for this profile.
A broker that later requires identity proof will ask on that request." No
file is accepted on this step in the MVP unless a future broker requirement
flips the flag. Biometric data is never requested.

Primary button: "Continue to review".

#### Step 5 — Review and save

`DefinitionList` of every collected field with: value (masked where
sensitive), why it is needed, required or optional, and "You can delete this
later from the data vault." Primary `Button` "Save profile". Secondary
"Back".

- **Empty:** Step 1 blank form.
- **Loading:** `LoadingState` "Saving your profile".
- **Error:** Field errors plus `ErrorState` for server failures
  (`PROFILE_SAVE_FAILED`).
- **Success:** Toast "Profile saved." Redirect to `/dashboard`.
- **Accessibility:** Step list is a `nav` "Onboarding steps". Current step
  `aria-current="step"`.
- **Audit:** `profile.created` or `profile.updated`, `identifier.created`,
  `consent.recorded` with purpose `PROFILE_MANAGEMENT` and method
  `SELF_ATTESTATION`.

### Privacy data vault

- **Route:** `/vault`
- **Purpose:** Manage identifiers, household pointers, export and deletion.
- **Primary goal:** See and change what is stored for the active profile.
- **Visible:** `PageHeader` "Data vault". `Tabs`: Identifiers, Addresses,
  Household, Consent, Export and deletion.
  - Identifiers: `DataTable` of type, masked value, primary flag, actions
    Edit / Reveal / Delete. `Button` "Add identifier".
  - Addresses: same pattern.
  - Household: summary + link to `/household`.
  - Consent: `Timeline` of `ConsentRecord` rows (purpose, method, date).
  - Export: `Button` "Download a copy of my data".
  - Deletion: `Button` "Delete this profile" and "Delete my account", both
    through `ConfirmDialog` (phrase `DELETE`).
- **Empty:** `EmptyState` "No identifiers stored" with "Add identifier" and
  "Set up your profile".
- **Loading:** `TableSkeleton`.
- **Error:** `ErrorState` `VAULT_LOAD_FAILED`.
- **Success:** Toast after each mutation.
- **Validation:** Same identifier rules as onboarding. No special-category
  fields.
- **Accessibility:** Reveal buttons named "Show email address" etc.
- **Audit:** `identifier.created` / `updated` / `deleted` / `revealed`,
  `profile.deleted`, `account.export_requested`,
  `account.deletion_requested`.

### Household

- **Route:** `/household`
- **Purpose:** Add adult household profiles with explicit consent.
- **Primary goal:** Invite another adult and track consent until verified.
- **Visible:** `PageHeader` "Household profiles". Intro `Alert`: children's
  data is not collected in this version. `Button` "Add an adult you manage".
  `DataTable`: display name, relationship, consent `StatusBadge`, invited
  email (masked), actions.
  Add dialog fields: display name, relationship (`Select`: spouse or partner,
  parent, adult child, sibling, other adult), email of the person, statement
  checkbox "I confirm this person is an adult and I will only send requests
  after they accept the invitation." Why we ask on every field.
- **Empty:** `EmptyState` "You are only managing your own profile".
- **Loading:** `TableSkeleton`.
- **Error:** `ErrorState` `HOUSEHOLD_LOAD_FAILED`. Invite failures keep the
  dialog open with a field error.
- **Success:** Toast "Invitation sent." Row status `PENDING_CONSENT`.
- **Validation:** Email required. Relationship required. Minors blocked with
  a visible explanation, not a silent reject. Cannot submit requests until
  `EXPLICIT_CONSENT_OBTAINED`.
- **Accessibility:** Status text + badge. Dialog labelled "Add an adult you
  manage".
- **Audit:** `household.member_added`, `household.consent_invited`,
  `household.consent_verified` / `declined` / `revoked`,
  `household.member_removed`.

Consent accept page (unauthenticated, token in the link): `/household/consent/[token]`.
Shows the statement, buttons "I agree" and "I decline". Audit as above.

### Broker discovery

- **Route:** `/brokers`
- **Purpose:** Browse the instance broker directory for the active profile's
  jurisdiction.
- **Primary goal:** Select brokers to include in a new workflow.
- **Visible:** `PageHeader` "Brokers". `Alert` when records are demo data.
  Filters: search, category `Select`, country, verification status. `DataTable`
  columns: name, category, countries, verification `StatusBadge`, risk,
  "Demo" badge, checkbox select. Row click goes to a sheet with details
  (contact methods masked as business contacts, coverage, source URL via
  `ExternalLink`, last verified date).
- **Empty:** `EmptyState` "No brokers match these filters".
- **Loading:** `TableSkeleton`.
- **Error:** `ErrorState` `BROKER_LIST_FAILED`.
- **Success:** Selection count in the toolbar; `Button` "Start workflow with
  n brokers" to `/requests/new?brokers=...`.
- **Validation:** None for browsing. Production sending disabled brokers can
  still be prepared; sending is blocked later.
- **Accessibility:** Demo and risk are text badges, not colour-only.
- **Audit:** None for browsing.

### New removal workflow

- **Route:** `/requests/new`
- **Purpose:** Choose profile, brokers, request type and generate drafts.
- **Primary goal:** Produce prepared requests awaiting approval.
- **Visible:** `PageHeader` "Start new removal workflow". Steps:
  1. Profile `Select` (self vs managed, consent badge). Blocked if consent is
     not `SELF` or `EXPLICIT_CONSENT_OBTAINED`.
  2. Jurisdiction summary `Card` (country, region, available request types,
     legal basis, deadline, confidence, "Requires legal review" badge, source
     link).
  3. Request type `RadioGroup` (only types the rule supports).
  4. Broker multi-select (pre-filled from query). Each row shows whether a
     verified contact method exists.
  5. Identifiers to include (checkboxes of vault identifiers, masked).
  6. `Button` "Generate drafts".
- **Empty:** No brokers → `EmptyState` linking to `/brokers`.
- **Loading:** `LoadingState` "Generating drafts from the current legal rule
  version".
- **Error:** `CONSENT_REQUIRED`, `QUOTA_EXCEEDED`, `VALIDATION_FAILED` as
  `Alert` plus `ErrorState`.
- **Success:** Redirect to `/requests` filtered to the new batch, toast
  "n drafts prepared. Nothing has been sent."
- **Validation:** Exactly one profile. At least one broker. At least one
  identifier. Consent checked server side.
- **Accessibility:** Radio group labelled "Request type". Disabled types
  explain why.
- **Audit:** `request.created`, `request.rendered`,
  `request.manual_review_flagged` when triggered,
  `system.quota_exceeded` on fair use hits.

### Request review and approval

- **Route:** `/requests/[id]/review`
- **Purpose:** Force a human to read the exact outbound text before send.
- **Primary goal:** Approve or send back to draft.
- **Visible:** `PageHeader` "Review this request". Summary `Card` with
  `DefinitionList` fields, in this order, with these labels:
  - Profile
  - Broker
  - Jurisdiction
  - Request type
  - Legal basis
  - Data included
  - Destination
  - Deadline
  - Manual review required
  - Final request text (`pre` / `Textarea` read-only of the snapshot)
    Confirmation `Checkbox` labelled exactly:
    **I have reviewed the profile, consent status, destination, legal basis and
    final request text.**
    Primary `Button` "Approve and queue for sending" **disabled until the
    checkbox is checked**. Secondary "Back to draft". If manual review reasons
    exist, an `Alert` lists them; the same checkbox still applies (self-service
    review).
- **Empty:** Unknown id → `not-found`.
- **Loading:** `CardSkeleton`.
- **Error:** Snapshot hash mismatch `CONFLICT` "This text changed. Reload
  before approving." Consent invalid `CONSENT_INVALID`.
- **Success:** Toast "Request approved. Sending is queued." Redirect to
  `/requests/[id]`.
- **Validation:** Checkbox required. Server re-checks consent, destination,
  broker sendability, and snapshot `contentHash`.
- **Accessibility:** Checkbox labelled with the full sentence. Disabled
  button has `aria-describedby` pointing at the checkbox hint.
- **Audit:** `request.approved`, `consent.recorded` (purpose
  `REQUEST_SUBMISSION`), `request.status_changed`. Rejecting the text without
  approving does not write `request.approval_rejected` unless the user
  explicitly chooses "Back to draft".

### Request tracker

- **Route:** `/requests`
- **Purpose:** List the account's requests for the active profile (with an
  all-profiles filter).
- **Primary goal:** Find items that need action.
- **Visible:** `PageHeader` "Requests" with "Start new removal workflow".
  Filters: status, request type, broker, needs-action toggle. `DataTable`:
  broker, profile, type, status `StatusBadge`, destination (masked),
  deadline, updated. Row links to `/requests/[id]`. Awaiting approval rows
  also link "Review".
- **Empty:** `EmptyState` "No requests yet" + start button.
- **Loading:** `TableSkeleton`.
- **Error:** `ErrorState` `REQUEST_LIST_FAILED`.
- **Success:** Filterable table.
- **Validation:** Filter enums only.
- **Accessibility:** Status via badge text. Deadline dates in a parseable
  format, not colour.
- **Audit:** None for listing.

### Request detail

- **Route:** `/requests/[id]`
- **Purpose:** Inspect one request, its events, evidence and next actions.
- **Primary goal:** Understand status and take the next allowed action.
- **Visible:** `PageHeader` with broker name and `StatusBadge`. Summary
  `DefinitionList`. `Tabs`: Timeline (`Timeline` of
  `RemovalRequestEvent`), Snapshot (read-only final text), Evidence, Broker
  responses. Action buttons depend on state: Review, Close, Prepare follow
  up, Mark completed, Upload evidence. Close uses `ConfirmDialog`.
- **Empty:** 404.
- **Loading:** `CardSkeleton`.
- **Error:** `ErrorState` `REQUEST_LOAD_FAILED`. Invalid transitions show
  `Alert` with `INVALID_STATE_TRANSITION`.
- **Success:** Event list newest last (chronological).
- **Accessibility:** Timeline is an `ol`. Actions named after the transition.
- **Audit:** `request.status_changed`, `request.closed`,
  `request.follow_up_prepared`, `evidence.uploaded`.

### Evidence

- **Route:** `/evidence`
- **Purpose:** Files attached to the user's requests.
- **Primary goal:** Upload a screenshot or download existing evidence.
- **Visible:** `PageHeader` "Evidence". `Alert` on identity documents:
  temporary, encrypted, auto-deleted. `DataTable`: kind, request, created,
  expiry, size, actions Download / Delete. Upload `Dialog`: kind `Select`,
  request `Select`, file `Input`, redaction guidance for ID files.
- **Empty:** `EmptyState` "No files stored".
- **Loading:** `TableSkeleton`.
- **Error:** `ErrorState` plus file validation errors on the dialog.
- **Success:** Toast "File stored."
- **Validation:** Allowed types image/png, image/jpeg, application/pdf.
  Max 8 MB. ID files require a request that asked for them.
- **Accessibility:** File input labelled. Expiry dates announced.
- **Audit:** `evidence.uploaded`, `evidence.downloaded`, `evidence.deleted`.

### Reports

- **Route:** `/reports`
- **Purpose:** Generate a user-facing privacy removal report.
- **Primary goal:** Download a date-range report with limitations.
- **Visible:** `PageHeader` "Reports". Form: date from, date to, profile
  `Select`, format `RadioGroup` JSON or PDF. `Button` "Generate report".
  List of previous reports with status and download. Report content includes
  brokers contacted, status per broker, legal basis, evidence references,
  open actions, limitations, suggested next steps. PDF uses pdfkit, never a
  hand-rolled generator.
- **Empty:** `EmptyState` "No reports yet".
- **Loading:** Generating status on the row (`StatusBadge` progress).
- **Error:** `ErrorState` `REPORT_FAILED`.
- **Success:** Toast "Report ready." Download link.
- **Validation:** `dateTo >= dateFrom`. Range max 24 months.
- **Accessibility:** Format radios labelled. Download link names the format.
- **Audit:** `report.generated`, `report.downloaded`.

### Account settings

- **Route:** `/settings/account`
- **Purpose:** Account metadata, sessions, notifications, deletion.
- **Primary goal:** Change display name, sign out other sessions, delete the
  account.
- **Visible:** `PageHeader` "Account settings". Fields: display name, email
  (read-only, masked with reveal), timezone. Sessions table with "Revoke".
  Notification preferences switches (email / in-app per type). Danger zone:
  "Delete my account" `ConfirmDialog` phrase `DELETE`.
- **Empty:** Sessions always include the current one.
- **Loading:** `CardSkeleton`.
- **Error:** Field errors / `ErrorState`.
- **Success:** Toast "Account updated."
- **Validation:** Display name 1–80 chars.
- **Accessibility:** Danger zone heading. Confirm dialog as specified.
- **Audit:** `account.updated`, `auth.session.revoked`,
  `account.deletion_requested`.

### Privacy and deletion settings

- **Route:** `/settings/privacy`
- **Purpose:** Explain retention and masking; export data.
- **Primary goal:** Understand what is stored and export or delete it.
- **Visible:** `PageHeader` "Privacy settings". `DefinitionList` of retention
  periods from system settings. Masking explanation. `Button` "Download a
  copy of my data". Link to the vault for per-field deletion. Statement that
  the instance is not a law firm.
- **Empty:** N/A.
- **Loading:** `CardSkeleton`.
- **Error:** `ErrorState` `EXPORT_FAILED`.
- **Success:** File download.
- **Audit:** `account.export_requested`, `account.export_downloaded`.

---

## Admin screens

Every admin page calls `requireRole` (`MAINTAINER` or `INSTANCE_ADMIN` as
specified) and writes `admin.console_accessed` once per session window when
the console is opened. Sensitive user data requires a break-glass grant.

### Admin home

- **Route:** `/admin`
- **Purpose:** Hub for instance operations.
- **Primary goal:** Reach brokers, legal rules, templates, jobs, audit.
- **Visible:** `PageHeader` "Admin". Cards linking to the subpages. Counts:
  unverified brokers, unpublished rule drafts, failed jobs, pending manual
  reviews. INSTANCE_ADMIN sees fair use settings and a break-glass panel.
- **Empty:** Zero counts are valid.
- **Loading / error:** standard.
- **Audit:** `admin.console_accessed`.

### Admin brokers

- **Route:** `/admin/brokers`
- **Roles:** MAINTAINER, INSTANCE_ADMIN
- **Purpose:** Curate the broker directory and verification.
- **Visible:** `DataTable` with filters (category, verification, demo,
  production sending). Row actions: edit `Sheet`, change verification
  `Select`, toggle production sending (disabled unless constraints pass).
  Create broker form with the schema fields. Demo badge always visible.
- **Validation:** Zod matching Prisma enums. Production sending blocked by
  the database check constraint; UI explains the missing preconditions.
- **Audit:** `admin.broker_created`, `admin.broker_updated`,
  `admin.broker_verification_changed`,
  `admin.broker_production_sending_changed`.

### Admin legal rules

- **Route:** `/admin/legal-rules`
- **Roles:** MAINTAINER, INSTANCE_ADMIN
- **Purpose:** Version legal rules. Never overwrite a published version.
- **Visible:** Jurisdiction `Select`. Table of rules and versions. "New
  version" copies the current published row into `DRAFT`. Publish action
  requires source URL, last reviewed date, reviewer name, change notes.
  Confidence LOW forces `requiresLegalReview`.
- **Audit:** `admin.legal_rule_created`,
  `admin.legal_rule_version_published`.

### Admin templates

- **Route:** `/admin/templates`
- **Roles:** MAINTAINER, INSTANCE_ADMIN
- **Purpose:** Edit request templates with known variables only.
- **Visible:** List by request type. Editor: subject, body, required
  variables. Preview with example values from
  `lib/templates/variables.ts`. Unknown placeholders are a validation error.
- **Audit:** `admin.template_created`, `admin.template_version_published`.

### Admin jobs

- **Route:** `/admin/jobs`
- **Roles:** INSTANCE_ADMIN
- **Purpose:** Inspect PostgreSQL-backed jobs.
- **Visible:** `DataTable`: type, status, runAt, attempts, lastError
  (redacted), related request id. Actions Retry / Cancel with
  `ConfirmDialog`. Logs sheet from `BackgroundJobLog`.
- **Audit:** `admin.job_retried`, `admin.job_cancelled`.

### Admin audit

- **Route:** `/admin/audit`
- **Roles:** INSTANCE_ADMIN
- **Purpose:** Read the hash-chained audit trail.
- **Visible:** Filters: action, actor, resource type, date. `DataTable` of
  AuditLog. Detail sheet shows metadata (already scrubbed). Button "Verify
  chain" reports the first inconsistency.
- **Break-glass:** Form with justification `Textarea` (min 20 chars), target
  user id, duration. Lists active grants. Viewing another user's data from
  here writes `admin.user_data_viewed`. Decrypted identifiers remain blocked.
- **Audit:** `admin.break_glass_granted` / `revoked`, `admin.user_data_viewed`.

---

## Status vocabulary

Use `REQUEST_STATUS_LABELS`, `CONSENT_STATUS_LABELS` and
`BROKER_VERIFICATION_LABELS` from `components/common/status-badge.tsx`
everywhere, including emails and reports.

## Out of scope for the UI

Billing, paywalls, urgency countdowns, guaranteed removal claims, children's
profiles, a mandatory legal-reviewer queue, and scraping tools.
