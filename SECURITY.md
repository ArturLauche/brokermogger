# Security policy

## Reporting

Email the address configured as `SECURITY_CONTACT_EMAIL` (default in `.env.example` is a placeholder). Do not open a public issue for a vulnerability that could expose personal data.

Please include:

- the instance version or commit
- a description of the impact
- steps that stay within authorised testing of your own instance

## What this project will not help with

Do not ask for scraping, CAPTCHA bypass, login bypass or exploits against third-party broker systems.

## Operator checklist

- Rotate `AUTH_SECRET`, `ENCRYPTION_KEYS` and `BLIND_INDEX_KEY` before going live.
- Keep `ALLOW_EXTERNAL_SENDING=false` until you have verified broker contacts.
- Do not enable production sending on demo broker rows.
- Restrict `/admin` to `MAINTAINER` / `INSTANCE_ADMIN`. Break-glass access is audited and still cannot decrypt identifiers.
