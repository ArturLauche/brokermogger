/**
 * Next.js proxy (the Next 16 replacement for `middleware.ts`).
 *
 * Two jobs, both cheap:
 *
 *  1. Content-Security-Policy with a per response nonce. The nonce is forwarded
 *     as the `x-nonce` request header and inside the request CSP header, which is
 *     how Next.js attaches it to its own scripts. In development the policy also
 *     allows `unsafe-eval` and `unsafe-inline`, because the dev overlay needs
 *     both. Production gets neither.
 *
 *  2. A UX redirect to `/login` when no session cookie is present on an
 *     authenticated route prefix.
 *
 * IMPORTANT: the redirect in step 2 is a convenience only. It looks at the
 * presence of a cookie, never at its validity, and it can be bypassed trivially.
 * Real authorization happens server side in every layout, server action and
 * route handler through `requireActor()` / `requirePermission()`. Never rely on
 * this file for access control.
 */
import { NextResponse, type NextRequest } from "next/server";

import { sessionCookieName } from "@/lib/auth/cookies";
import { env } from "@/lib/config/env";

/** Route prefixes that only make sense for a signed in account. */
const AUTHENTICATED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/vault",
  "/household",
  "/brokers",
  "/requests",
  "/evidence",
  "/reports",
  "/settings",
  "/admin",
];

function buildCsp(nonce: string, isDevelopment: boolean): string {
  const scriptSrc = isDevelopment
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval' 'unsafe-inline'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  // Tailwind injects styles through a stylesheet, but React still emits inline
  // style attributes for the dev overlay, so development needs unsafe-inline.
  const styleSrc = isDevelopment ? `'self' 'unsafe-inline'` : `'self' 'nonce-${nonce}'`;

  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
  ];

  if (!isDevelopment) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

function needsSession(pathname: string): boolean {
  return AUTHENTICATED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = env.APP_ENV === "development";
  const csp = buildCsp(nonce, isDevelopment);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const { pathname } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(sessionCookieName());

  if (!hasSessionCookie && needsSession(pathname)) {
    const loginUrl = new URL("/login", request.url);
    // Preserved so the user lands where they wanted to go after signing in.
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);

    const redirectResponse = NextResponse.redirect(loginUrl);
    redirectResponse.headers.set("Content-Security-Policy", csp);
    return redirectResponse;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-nonce", nonce);
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and the image optimiser. API routes are
    // included so that responses also carry the policy.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
