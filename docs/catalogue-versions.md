# Catalogue versions

Migration `20260928010000_immutable_catalogue` protects published legal rules and
request templates in PostgreSQL. Published text, source information, review dates,
version numbers and parent scope cannot be rewritten or deleted. Retirement can
move a published version to superseded or archived; it cannot republish an older
row. Corrections require a new draft and publication. Drafts remain editable.

Seed upgrades compare content before writing. Unchanged content creates no row;
changed content receives the next version number under a transaction lock. The
lock also covers concurrent first installs. Existing snapshot IDs and referenced
version IDs remain unchanged. Rolling back seed files does not revive superseded
content. Changing a published parent's jurisdiction, request type, channel or key
requires a new parent record.

Operator-maintained rules and templates receive seed changes as drafts. Seeding
preserves operator descriptions and activation choices. Review those drafts in
the catalogue before publishing them. A fresh installation still receives the
published versions declared by the seed catalogue.

Legal selection excludes inactive jurisdictions and rules. Future versions do not
apply before their effective date; the most recent applicable version wins. An
expired or withdrawn replacement does not silently restore a predecessor. Cached
catalogue reads refresh within 60 seconds, and operator writes invalidate the
local cache immediately. Historical requests keep their original references.

Apply the migration before rerunning seeds during an upgrade. It adds guards and
does not change existing content. A database backup is the rollback boundary for
removing these protections; do not edit published rows to make an older deployment
accept an update. The isolated test reset uses the existing explicit append-only
truncate override. Application code must never enable it.
