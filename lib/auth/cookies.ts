/**
 * Cookie policy for the session.
 *
 * Kept in its own module because `proxy.ts` needs the cookie name for its cheap
 * UX redirect and must not import the whole Auth.js configuration (and with it
 * Prisma) into the proxy bundle.
 *
 * Policy: httpOnly, sameSite lax (a magic link is a top level cross site
 * navigation, so strict would drop the session on the first hop), path `/`, and
 * secure plus the `__Secure-` prefix as soon as the instance runs over https.
 */
import { env } from "@/lib/config/env";

export function secureCookiesEnabled(): boolean {
  return env.isProduction || env.APP_BASE_URL.startsWith("https://");
}

function prefixed(name: string): string {
  return secureCookiesEnabled() ? `__Secure-${name}` : name;
}

export function sessionCookieName(): string {
  return prefixed("authjs.session-token");
}

export function callbackUrlCookieName(): string {
  return prefixed("authjs.callback-url");
}

/** CSRF uses the `__Host-` prefix upstream, which requires secure as well. */
export function csrfCookieName(): string {
  return secureCookiesEnabled() ? "__Host-authjs.csrf-token" : "authjs.csrf-token";
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
}

export function sessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: secureCookiesEnabled(),
  };
}
