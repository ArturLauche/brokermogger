# Broker and instance administration

Maintainers and instance administrators can create and edit brokers at
`/admin/brokers`. Instance settings at `/admin/settings` require the instance
administrator role. Repository boundaries enforce these permissions; a hidden
button is never the authorization mechanism.

## Broker workflow

1. Create the entry with a public source and clear notes. New entries start with
   sending disabled. Keep fictional entries marked as demo data.
2. Add a public contact method. Verification requires a real review date, source
   URL and an evidence note. Reconfirm verification when editing a method. Retire
   a method by marking it inactive; historical snapshots keep their destination.
3. Record jurisdiction coverage, its statutory/voluntary/unknown basis, confidence,
   supported initial request types and applicability notes. Suppression and
   deletion are separate types. Empty legacy or unknown coverage permits a draft
   for review, but cannot authorize real email dispatch.
4. Review the finished configuration and explicitly enable the broker's sending
   switch. Demo, inactive, unsafe or insufficiently verified entries cannot enable
   it. Editing broker details, contacts or coverage disables the switch again.

The global deployment flag, instance sending switch, current owner consent and a
complete approved message remain independent requirements. Enabling a broker
never contacts it or supplies user consent. Development and browser tests use the
mock provider with external sending disabled.

Broker-specific notes and methods are visible at `/brokers/[id]`, linked from the
directory and request screens. Verification requirements only inform review:
identity documents remain optional and require a recorded broker verification
request plus the user's explicit consent. Login, portal, postal, API and DROP
instructions remain manual steps; no scraping or bypass is introduced.

Edits lock the broker and use its last update as a revision token. Competing edits
receive a conflict instead of overwriting each other. Contact and coverage changes
commit with the parent change in one transaction. Request generation checks
compatibility again before reserving quota; approval and dispatch recheck current
configuration. Dispatch cannot use a retired destination.

The broker list is searchable and filtered in the URL, with stable creation-order
cursors: 25 records by default, at most 100 per repository call. Lists omit contact
payloads. Detail pages do not silently truncate contacts or coverage.

## Settings

The editor uses the validated catalogue in `lib/config/systemSettings.ts`; unknown
or sensitive settings cannot be written through it. Values are typed, range
checked and revision checked. Invalid legacy values are visibly identified and
use the compiled default until corrected. “Use default” writes the compiled
default as an explicit setting and records the change.

The app invalidates its cache after saving. Other processes reload settings within
15 seconds. Dispatch reads the instance sending switch directly. The operator
note is shown on the dashboard; the display name configures the public footer.
Public links accept HTTP/HTTPS without embedded credentials. Secret provider and
keyring configuration remains in deployment environment variables.

Fair-use settings change instance defaults; existing per-account quota overrides
still take precedence. Limits are operational controls, never paid upgrades.
Lowering a retention value can make older records eligible for the next sweep;
backups remain the operator's responsibility.

## Upgrade behavior and validation

No schema migration is required for these editors. Demo seeding now preserves
operator-managed, real and archived brokers, serializes concurrent seed runs and
commits each broker with its children. Removed demo contacts are archived.
Published legal/template history remains protected separately by migration 13.

Integration coverage includes role boundaries, stale edits, public URL validation,
child-ID scoping, failure rollback, verification gates, seed preservation, request
compatibility and pagination. A production browser journey exercises creation,
validation with retained input, contact verification, coverage and settings. Legal
and template authoring are the next operator workflow; this document does not imply
that their editors are finished.
