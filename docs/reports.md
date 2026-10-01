# Private reports

Reports include all requests created within the selected calendar dates, including
the entire final day. The account timezone is captured when the report is queued;
changing the account timezone later does not change that report's boundaries.
Ranges can span up to 24 calendar months. Daylight-saving changes and fractional
timezone offsets are included in the boundary calculation.

JSON and PDF downloads contain request IDs, broker names, request types, recorded
statuses, legal bases and dates. They exclude request letters, replies and
unmasked identifiers. A broker counts as contacted only if a real provider
accepted an email or the user recorded a manual submission. Mock sends and drafts
do not count. Provider acceptance does not establish delivery or removal.

Generation reads requests in bounded pages of 250 without a row-count truncation
cap. It excludes records created after generation began; statuses reflect their
values when each page was read. This is a generation-period summary, not a
transactionally frozen historical database snapshot. The finished file currently
renders in memory before encryption; streaming and memory benchmarks remain in
the performance workstream.

Report creation and job creation are atomic and duplicate form submissions are
idempotent. Every generation page and final publication checks the active account
and current worker lease. Private files remain in an inaccessible upload state
until publication commits the report, file and ready notification together.
Cancelled or superseded workers cannot publish a download. Unpublished files have
durable cleanup intents; a lost commit response never deletes a linked result.

The Reports screen shows progress, scheduled retries, cancellation, unavailable
files and an explicit **Generate again** action. Downloads are authenticated,
ownership checked, integrity verified, encrypted at rest and served with private
no-store headers and useful filenames. Evidence retention also applies to reports.
Account, profile or identifier erasure invalidates derived copies and pending work.

On upgrade, historical report labels retain their original UTC interpretation.
Existing completed files remain unchanged and are labelled historical. Regenerating
a report uses the corrected inclusive date boundaries. Legacy jobs are associated
with their report where their original idempotency key proves the relationship;
reports without a usable job can be generated again.
