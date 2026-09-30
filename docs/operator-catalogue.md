# Catalogue and instance administration

Maintainers and instance administrators can create and edit brokers at
`/admin/brokers`. Instance settings at `/admin/settings` require the instance
administrator role. Repository boundaries enforce these permissions; a hidden
button is never the authorization mechanism. Privileged writes also recheck the
current role and account status while holding the account lock, so a demotion or
deletion cannot leave a previously authenticated operator authorized to write.

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

## Request templates

Maintainers and administrators can create, search and filter templates at
`/admin/templates`. New templates start inactive with an editable draft. The stable
key, request type, channel and jurisdiction stay fixed; create another template to
change its scope. Version lists use the same 25-row cursors and 100-row maximum as
broker lists and omit full letter content until a version is opened.

Save a draft to preview its actual saved text with synthetic self and household
examples. No personal records are read and no message is sent. Unknown or malformed
placeholders, invisible characters, HTML and email-header lines are rejected with
field errors. New draft sources normalize browser/Windows line endings before
checksumming; published history is never rewritten. Publication requires the core identification, approved identifiers,
legal basis, reply address, reference, date and optional household-consent blocks;
review notes; and an explicit confirmation of the saved preview. Maximum declared
values must fit the complete 200-character subject and 100,000-character body.

Publishing is atomic: the new version becomes published, previous versions of that
parent become superseded, and other active parents with the same request type,
channel and jurisdiction become inactive. Published text is immutable. Existing
snapshots, approvals and historical destinations keep their original content and
references. Deactivating a template prevents its selection for new letters. Start a
new draft to reactivate or correct it; malformed legacy text can also be copied into
a repair draft without changing the original.

Edits and publication check the parent revision. Competing changes cannot silently
overwrite another operator's review. Publication also checks the saved source
checksum. Selection is deterministic: the profile's jurisdiction takes precedence,
then the requested channel, then the shared plain-letter EMAIL fallback for manual
channels, then equivalent generic choices. A portal-only template cannot serve an
email request. A bulk generation reuses each channel lookup. Generation, regeneration
and follow-up publication reject a destination change that occurs after rendering,
before writing a new snapshot or reserving draft quota.

Seeding preserves operator choices, including a published custom template created
before the default catalogue was installed. A seeded competitor arrives inactive
with a draft for review. Publication and seeds serialize their scope changes.

## Legal rules

Maintainers and administrators can create, search, filter and paginate rules at
`/admin/legal-rules`. A new rule starts inactive with a draft. The stable key and
jurisdiction remain fixed. The editor records supported types, a safe legal-basis
line, applicability and exceptions, confidence, review flags, verification,
escalation, primary sources, actual review date and effective UTC instants.

Timing uses explicit calendar days, calendar months, business days or no fixed
period. A primary timing source is required; an unverified period requires legal
review. Public-holiday calendars have explicit source and coverage. Extensions
and pauses are described as conditions and never applied automatically. Consult
`response-targets.md` for operational estimates and recorded receipt behavior.
Government-document flags describe potential verification requirements; they do
not collect documents or override the optional consent-based evidence workflow.

Save before reviewing the preview. It uses the generic letter with synthetic
identifiers and the saved legal basis, plus a month-end receipt example. Actual
jurisdiction-specific templates must be reviewed separately. Clause selections
describe expected content and do not insert text automatically. Publication
requires notes and explicit confirmation bound to the saved configuration hash.
Stale edits and mismatched parent/version IDs are rejected.

Publication and supersession commit together. A future-effective publication
leaves the currently applicable version published and cannot be selected early.
If the rule was inactive, publication retires its earlier published versions
instead of reactivating withdrawn law; the reviewed successor becomes eligible
only at its effective time.
The catalogue selects the most recent effective version; an expired replacement
does not revive earlier law. Deactivation stops all versions of that rule from
serving new requests. Existing request snapshots and legal references stay
unchanged. Published versions cannot be edited; copy one into a fresh draft to
make a correction. Legacy timing without a typed policy must be sourced and
repaired before publication, rather than inferred from an old day count.

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
validation with retained input, contact verification, coverage, settings and the
full template and legal-rule draft/repair/preview/publication/supersession
workflows, including future-effective scheduling. Failure injection checks that
legal publication cannot partially replace the current version. Demotion tests
check current authority at privileged writes.
