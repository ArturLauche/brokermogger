# Magic links and reverse-proxy trust

Both the `/login` action and `POST /api/auth/signin/magic-link` pass through
`authorizeMagicLinkRequest()` before Auth.js generates a verification token or
calls the email provider. The delivery callback rechecks that same request-local
decision. A caller cannot provide a "quota already consumed" flag. Repeated and
concurrent checks in one request share a promise; a different address or request
gets its own decision.

One database transaction atomically increments both hashed fixed-window
counters. There is no read-then-write admission race. Rejected attempts still
count against the current windows. A failed transaction rolls back both counters;
a failed gate cannot send a link. The existing operational limits remain three
links per address per 15 minutes and ten per network per hour. Fixed windows can
permit bursts at a boundary; this is not a sliding-window policy.

Allowed and quota-denied direct calls have the same Auth.js verification redirect.
The form always returns the check-email page. Neither response reports whether an
account exists or an address was throttled. The ordinary Auth.js CSRF validation
still runs before the direct POST gate; server actions retain Next's origin
checks. Quota admission and rejection use the existing audit actions, with
hashed context and boolean denial reasons, never raw identifiers.

Issued callback links are pinned to `APP_BASE_URL`'s origin, preserving the Auth.js
callback path and token query. `AUTH_URL` should also identify the public origin.
Redirect destinations remain restricted to the configured instance origin.
Database sessions, token expiration/single use and account-deletion invalidation
continue to use the existing adapter and guards.

## Safe defaults

`TRUSTED_PROXY_IP_HEADER=none` is the default. Forwarding headers are ignored.
Missing, invalid or ambiguous attribution uses a **shared unknown-network bucket**;
it does not exempt a caller from the network quota. On a multi-user instance this
means ten sign-in attempts per hour across those callers, so configure a trusted
ingress deliberately before upgrading or opening the service to users.

`AUTH_TRUST_HOST` is Auth.js host trust, **not** authorization to trust client-IP
headers. Setting it does not enable IP attribution.

## Configuring an ingress

To use `x-real-ip` or `x-forwarded-for`, all of these must be true:

1. The application can be reached only through the trusted ingress (bind its
   published port to loopback/private networking or enforce the ingress firewall).
2. The ingress **overwrites** the chosen header with exactly one numeric client
   IP. Do not append a caller-provided chain or use its leftmost hop.
3. Only that header is selected in `TRUSTED_PROXY_IP_HEADER`. There is no fallback
   to another, potentially untrusted header.

For a single public Nginx ingress with clients connecting directly to it:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Set `TRUSTED_PROXY_IP_HEADER=x-real-ip`. If there is a CDN or another proxy in
front, first configure Nginx's real-IP module with that provider's verified
address ranges and header contract; `$remote_addr` must represent the client
according to that explicit trust boundary. Do not copy a chain from an arbitrary
request. Brokermogger does not infer trusted proxy ranges or hop counts.

The `x-forwarded-for` option also accepts **one** numeric address only. Commas,
ports, hostnames and IPv6 zone identifiers are rejected. Equivalent IPv6 forms
are canonicalised before hashing. Rejecting an attribution falls back to the
shared quota; it does not reject a legitimate sign-in outright.

## Verification

Integration tests exercise Auth.js's real HTTP, CSRF and token pipeline through
its core implementation. Only Next's bundler-specific adapter is shimmed there.
Browser tests exercise the real Next route and form together. Fixtures use mock
email, a dedicated test database and disabled external broker sending.
