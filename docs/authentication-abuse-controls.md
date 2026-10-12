# Magic links and reverse-proxy trust

Both the `/login` action and `POST /api/auth/signin/magic-link` pass through
`authorizeMagicLinkRequest()` before Auth.js generates a verification token or
calls the email provider. The delivery callback rechecks that same request-local
decision. A caller cannot provide a "quota already consumed" flag. Repeated and
concurrent checks in one request share a promise; a different address or request
gets its own decision.

One database transaction atomically increments both hashed fixed-window
counters and appends the mandatory hash-chained audit event. The throwing audit
path is bound to that transaction, including the chain's existing advisory lock;
best-effort `recordAudit()` is never used for admission. There is no read-then-write
admission race. Rejected attempts still count against the current windows. A failed
counter or audit write rolls back both counters and the proof; it cannot issue a
token or send a link. The existing operational limits remain three
links per address per 15 minutes and ten per network per hour. Fixed windows can
permit bursts at a boundary; this is not a sliding-window policy.

Allowed, quota-denied and failed-admission direct calls have the same Auth.js
verification redirect, including JSON replies.
The form always returns the check-email page. Neither response reports whether an
account exists or an address was throttled. The ordinary Auth.js CSRF validation
still runs before the direct POST gate; server actions retain Next's origin
checks. Quota admission and rejection use the existing audit actions, with
hashed context and boolean denial reasons, never raw identifiers.

The request-local promise represents the whole transaction. A rejected promise
stays rejected for the rest of that request: simultaneous and later callback or
delivery checks do not retry or charge again. After rollback, a fresh HTTP request
may retry with a fresh context. This is single-flight admission within one request,
not a cross-request cache or a guarantee that subsequent email delivery succeeds.

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
Any one caller can exhaust that shared allowance and deny sign-in to everyone
for the current window. This conservative fallback protects against email abuse;
it is unsuitable as the intended client attribution for a public multi-user service.

Run `npm run check:deployment` with the actual deployment environment to see an
explicit warning. Before opening a public multi-user instance, run
`npm run check:deployment -- --public`; it exits unsuccessfully if trusted IP
attribution is unconfigured or rate limiting is disabled. This checks configuration
only and cannot attest that a firewall or proxy is correctly deployed.

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

Before inviting users, verify the trust boundary from outside the ingress:

1. An attempt to reach the application port directly must fail. For a host-local
   Nginx deployment, publish Docker's app port as `127.0.0.1:3000:3000`, not
   `3000:3000`; apply an equivalent private service/firewall boundary elsewhere.
2. Inspect the ingress configuration to confirm `proxy_set_header X-Real-IP
$remote_addr` overwrites the selected header. `$http_x_real_ip` and
   `$proxy_add_x_forwarded_for` retain caller-controlled values and do not meet
   this contract. Check every ingress path, including health/alternate host routes.
3. In an isolated mock-email test instance, submit sign-in attempts from one source
   while varying forged `X-Real-IP`/`X-Forwarded-For` values. They must use the same
   network bucket and allowance. Two controlled sources through a correctly
   configured ingress should have separate network buckets. Inspect only hashed
   context in the operator audit; never expose raw IPs in a public diagnostic API.

The `x-forwarded-for` option also accepts **one** numeric address only. Commas,
ports, hostnames and IPv6 zone identifiers are rejected. Equivalent IPv6 forms
are canonicalised before hashing. Rejecting an attribution falls back to the
shared quota; it does not reject a legitimate sign-in outright.

## Verification

Integration tests exercise Auth.js's real HTTP, CSRF and token pipeline through
its core implementation. Only Next's bundler-specific adapter is shimmed there.
Browser tests exercise the real Next route and form together. Fixtures use mock
email, a dedicated test database and disabled external broker sending.
