# Privacy and retention

Brokermogger stores the minimum needed to prepare and prove a privacy request.

## What is stored

- Account email (Auth.js)
- Profile display name, encrypted legal name, country/region, encrypted contact email
- Encrypted identifiers with masked previews and blind indexes
- Request snapshots (the approved text)
- Consent records (append-only)
- Evidence files (optional)
- Audit log (no raw personal data)

Not collected by default: date of birth, government ID, biometrics, financial data, children's data.

## Retention defaults

From `lib/config/systemSettings.ts`:

- Evidence: 24 months after close
- Temporary identity files: 30 days
- Closed requests: 24 months
- Audit log: 24 months
- Consent records: 72 months
- Job logs: 90 days
- Email metadata: 12 months

The worker jobs `PURGE_EVIDENCE`, `PURGE_TEMP_ID_FILES` and `RETENTION_SWEEP` apply these windows. Append-only tables need the session setting `brokermogger.allow_append_only_delete=on` inside that transaction.

## Export and deletion

- `/settings/privacy` and `/api/account/export` download a JSON copy without decrypted identifiers.
- Profile and account deletion require typing `DELETE`.
- Account deletion enqueues `DELETE_ACCOUNT_DATA`, which anonymises identifiers and the login email.
