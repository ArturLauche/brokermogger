# Account exports

Privacy settings links to `/settings/privacy/exports`. Owners can generate a
masked JSON copy or explicitly confirm a sensitive copy. Both are encrypted with
the instance keyring in private storage, owned by the requesting account and
available for 24 hours after successful generation. The download itself is
unencrypted JSON. Expiry is checked on every download, including the underlying
evidence endpoint; the retention worker then removes the stored object.

The masked copy includes account settings, profiles, identifiers, household and
consent history, requests, snapshot/event metadata, manual submissions, response
metadata, evidence metadata, reports, notifications, delivery/receiving metadata,
session and linked-account metadata, quotas, audit/access records, jobs and export
history. Personal labels and identifiers are masked. Full letters, replies and
private webhook content are omitted. It still contains private account history.

The sensitive copy also includes unmasked identifiers and profile fields, complete
stored letters and replies, the approved envelope, private correspondence payloads,
consent statements and proof. It requires a separate confirmation of the versioned
notice. The confirmation hash and time are stored with the queued export. Changed,
missing or more-than-24-hour-old generation approval requires a new confirmation;
an existing ready file keeps its own 24-hour download window.

File bytes are not embedded in either JSON copy. The evidence manifest gives
metadata and authenticated download paths for available original files. Download
these separately before their individual retention periods expire. Previously
erased data cannot be recovered. Neither mode exports session tokens, OAuth tokens,
login-link secrets, blind indexes, ciphertext, encryption keys, storage locations,
storage credentials or operator configuration. Account audit records are scoped
proof, not a complete independently verifiable copy of the instance hash chain.

Each category is read in stable ID pages of 100. There is no silent record-count
cap. Records created after generation starts are excluded; fields reflect when
their page was read. The output is assembled in memory before encryption; large
export memory and streaming remain part of the performance measurement work.
The original `/api/account/export` endpoint remains an authenticated, private
masked JSON download using the same projections and schema version 2.

Creation and enqueue commit atomically. One active export per mode prevents
duplicate generation from monopolising worker capacity. Worker leases, account
status, ownership and sensitive approval are checked at each source page and
publication. Staged copies cannot be downloaded. Ready publication includes an
in-app notification; optional reminder email follows the account preference and
never includes exported content.

Cancel/delete disables access immediately and records a resumable storage purge.
Deleting an identifier, profile, reply or evidence also invalidates derived
exports, cancels their generation and schedules cleanup. Account erasure removes
export records and stored copies. The application cannot erase copies already
downloaded or operator-controlled backups; their retention is separate.

Failures appear with retry status or a prompt to create another export. Expired
sensitive approval is never refreshed by a worker or operator job retry. Deploy
the app, worker and additive export migration together.
