# Brokermogger interface conventions

The product is a privacy request desk. Keep the existing blue/slate identity,
system typography, navigation and calm language. Make the next useful action
clear; avoid giving every statistic or piece of explanatory text a separate card.

## Layout and visual tokens

- Use the shared `AppShell`, `PublicHeader`, `PageHeader` and shadcn primitives.
  Each rendered screen, including empty and error states, has one meaningful H1.
- Space on a 4px scale. Control corners are 6px and distinct surfaces are 8px.
  Prefer borders and section dividers; shadows communicate floating elevation.
- The workspace content grid has a 1200px maximum. Ordinary forms use an
  approximately 680px column. Letters use the available width with a readable
  text measure. Body text is 16px; dense desktop controls can use 14px.
- Controls are 40px high on desktop and at least 44px on small screens and
  coarse pointers. Checkbox labels provide the touch target without enlarging
  the checkbox itself.
- Mobile navigation is a sheet. Profile selection occupies its own header row.
  Main content and grid children permit shrinking; wide tables and tabs scroll
  inside named, keyboard-focusable regions.

## States, accessibility and privacy

Use inline pending, field-error, success and retry feedback. `FormFeedback`
provides mutation feedback and `FieldError` links messages with
`aria-describedby`. Forms retain entered values after validation failures. File
uploads retain the selected file when signature or metadata validation fails.
There is no global toast or tooltip provider unless a feature needs one.

`EmptyState` and `ErrorState` normally use H2 under the page title. Full-page
errors explicitly use H1. Loading routes expose a status announcement. Error
copy must not assert that nothing was sent when an external outcome is unknown.

Menus and dialogs support the keyboard and restore focus to their invoking
control. Destructive dialogs start on Cancel, require the displayed confirmation
phrase, and describe the actual deletion policy. Session revocation and blocked
access happen immediately; file cleanup is resumable, and minimal consent/audit
proof and operator-controlled backups have separate retention rules.

Status labels use text and icons as well as colour. Use visible focus, readable
contrast and labelled controls. Tables have column headings, an accessible name
and a focusable scroll region. Do not hide records or columns merely to fit a
small screen. Use URL filters and pagination for collection screens.

Personal values are masked by default. Identifier reveals are explicit and
audited. `LetterPreview` uses a closed native disclosure for the exact message.
Correspondence is rendered as escaped text, without remote tracking images or
executing broker HTML. Download links use native anchors and private endpoints.

## Core screens

The dashboard starts with the actionable queue. Four primary summaries show
prepared requests, items needing attention, items awaiting the broker and
completed requests. A native disclosure retains the detailed breakdown. Counts
come from database aggregates; preview lists are bounded independently. Upcoming
deadlines exclude terminal requests. Dates honor the account timezone.

Onboarding can be saved and resumed. Profile editing, matching identifiers,
residency confirmation and adult household consent use shared labelled fields
with an explanation of why each value is needed. No birth dates, children's
profiles, biometrics or financial fields are collected.

Request entry shows applicable initial request types and preserves broker and
identifier selections after validation. Duplicate requests link to existing
owned records. Review presents a compact delivery summary, an exact letter
reveal and an explicit approval area. An edited or regenerated draft requires
fresh approval. Completed or otherwise ineligible requests do not display draft
editing or approval controls.

Manual submission shows the approved text, portal/postal instructions and a
user-recorded submission date. Replies require user-confirmed classification
before changing the request. Follow-ups, final reminders, verification actions,
retries and escalation preparation are contextual actions on an existing
request. Reconciliation explains uncertain provider outcomes; cancellation does
not imply an accepted email can be recalled.

Notifications have read, unread, dismiss and restore actions. Notification email
is optional. Evidence uploads have an optional request association and show
stored unassigned files even when a profile filter is active. Identity documents
require a recorded verification request and separate explicit consent.

Reports and account exports show queued progress, failure/retry states and
private downloads. Sensitive exports require separate confirmation and expire
after 24 hours. Account settings distinguish the encrypted sign-in address from
profile contact information and validate timezones.

Operator screens share the catalogue editor and table conventions. Published
versions remain immutable. Broker edits disable sending until the changed
configuration is verified; publication and settings changes reject stale
revisions. Break-glass reads are minimized and audited, and never authorize
another account's approval, deletion or sensitive download.

## Public and production behavior

Keep all landing-page sections and anchors, with deliberate headings and plain
section layouts. FAQ answers use native disclosures and work without JavaScript.
The favicon, language attribute, canonical URL, Open Graph images, JSON-LD,
sitemap, robots rules and `llms.txt` remain available. Private screens are noindex.
Do not invent sitemap modification dates.

HTML, including missing-route responses, is rendered dynamically with the
runtime deployment URL and per-document CSP nonce. Client instrumentation binds
Radix's injected scroll-lock styles to that document nonce. Production builds
retain strict script protection even when instance settings call the environment
"development". CI checks CSP, hydration and console errors on browser journeys.

See [interface verification](interface-verification.md) for visual comparisons,
viewport checks and measured JavaScript transfer. Remaining feature and
production work is tracked in [implementation progress](implementation-progress.md).
