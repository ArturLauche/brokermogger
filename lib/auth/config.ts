/**
 * Auth.js v5 configuration.
 *
 * Decisions encoded here:
 *  - Magic link only. No passwords to leak, no OAuth provider that would learn
 *    which brokers a person is fighting.
 *  - Database sessions. A self hosted instance must be able to revoke a session
 *    server side, which a stateless JWT cannot do.
 *  - The email is sent through our own `EmailProvider` adapter, never through
 *    nodemailer, so development stays offline and staging stays redirected.
 *  - Every lifecycle step writes an audit entry: account created, signed in,
 *    signed out, sign in refused.
 */
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { EmailConfig } from "@auth/core/providers/email";

import { anonymousAuditActor, recordAudit } from "@/lib/audit/service";
import { env } from "@/lib/config/env";
import { createAuthAdapter } from "@/lib/db/repositories/authAdapter";
import {
  findAccountByEmail,
  findAccountById,
  initialiseNewAccount,
  markSignedIn,
} from "@/lib/db/repositories/users";
import { createLogger } from "@/lib/observability/logger";

import {
  callbackUrlCookieName,
  csrfCookieName,
  sessionCookieName,
  sessionCookieOptions,
  secureCookiesEnabled,
} from "./cookies";
import { authRedirect } from "./redirect";
import { sendMagicLinkVerificationRequest } from "./magicLink";
import { authorizeMagicLinkRequest, MAGIC_LINK_VERIFY_PATH } from "./magicLinkRateLimit";
import { buildUserActor, readRequestContext } from "./requestContext";

const log = createLogger("auth");

/** 30 days, refreshed once a day. Long enough to be usable, short enough to expire. */
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const SESSION_UPDATE_AGE_SECONDS = 24 * 60 * 60;

/**
 * Custom email provider. Deliberately not the nodemailer provider: delivery is
 * our own adapter. The identifier normalisation stays with Auth.js, which
 * lowercases and NFKC normalises the address and rejects homoglyph attacks.
 */
const magicLinkProvider: EmailConfig = {
  id: "magic-link",
  type: "email",
  name: "Email link",
  from: env.EMAIL_FROM,
  maxAge: env.AUTH_MAGIC_LINK_TTL_SECONDS,
  sendVerificationRequest: sendMagicLinkVerificationRequest,
};

function isInstanceAdminEmail(email: string): boolean {
  return env.instanceAdminEmails.includes(email.trim().toLowerCase());
}

/**
 * The sign out event carries either a database session or a JWT. Only the
 * database branch has ids, and the adapter return type is deliberately loose,
 * so the shape is narrowed here instead of at every use site.
 */
function endedSession(message: unknown): { id?: string; userId?: string } | null {
  if (typeof message !== "object" || message === null || !("session" in message)) {
    return null;
  }

  const session = (message as { session: unknown }).session;
  if (typeof session !== "object" || session === null) {
    return null;
  }

  return session as { id?: string; userId?: string };
}

export const authConfig: NextAuthConfig = {
  adapter: createAuthAdapter(),
  secret: env.AUTH_SECRET,
  trustHost: env.AUTH_TRUST_HOST,
  session: {
    strategy: "database",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  useSecureCookies: secureCookiesEnabled(),
  cookies: {
    sessionToken: {
      name: sessionCookieName(),
      options: sessionCookieOptions(),
    },
    callbackUrl: {
      name: callbackUrlCookieName(),
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureCookiesEnabled(),
      },
    },
    csrfToken: {
      name: csrfCookieName(),
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureCookiesEnabled(),
      },
    },
  },
  providers: [magicLinkProvider],
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
    error: "/login/error",
  },
  callbacks: {
    async redirect({ url }) {
      return authRedirect(url, env.APP_BASE_URL);
    },
    /**
     * The only gate that can stop a sign in. Returning false makes Auth.js
     * redirect to `/login/error?error=AccessDenied`.
     */
    async signIn({ user, email }) {
      // A string redirect stops Auth.js before token creation and email delivery.
      // Match the allowed response so quotas do not reveal account/address state.
      if (email?.verificationRequest) {
        return (await authorizeMagicLinkRequest(user.email ?? ""))
          ? true
          : new URL(MAGIC_LINK_VERIFY_PATH, env.APP_BASE_URL).href;
      }

      const account =
        (user.id ? await findAccountById(user.id) : null) ??
        (user.email ? await findAccountByEmail(user.email) : null);

      // No row yet: this link creates the account, and new accounts are ACTIVE.
      if (!account) {
        return true;
      }

      if (
        account.status === "ACTIVE" &&
        account.deletedAt === null &&
        account.deletionRequestedAt === null
      ) {
        return true;
      }

      const context = await readRequestContext();
      await recordAudit({
        actor: buildUserActor({
          userId: account.id,
          role: account.role,
          email: account.email,
          sessionId: null,
          context,
        }),
        action: "auth.sign_in.failed",
        resourceType: "user",
        resourceId: account.id,
        targetUserId: account.id,
        outcome: "DENIED",
        reason: "The account is not active.",
        metadata: { accountStatus: account.status },
      });

      log.warn(
        { accountStatus: account.status },
        "Refused sign in for an inactive account"
      );
      return false;
    },

    /** Exposes the fields the UI needs. Authorization still goes through policy.ts. */
    async session({ session, user }) {
      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          role: user.role,
          status: user.status,
          timezone: user.timezone ?? "UTC",
        },
      };
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id || !user.email) {
        return;
      }

      const promote = isInstanceAdminEmail(user.email);
      const account = await initialiseNewAccount({
        userId: user.id,
        email: user.email,
        promoteToInstanceAdmin: promote,
      });

      const context = await readRequestContext();
      await recordAudit({
        actor: buildUserActor({
          userId: account.id,
          role: account.role,
          email: account.email,
          sessionId: null,
          context,
        }),
        action: "account.created",
        resourceType: "user",
        resourceId: account.id,
        targetUserId: account.id,
        metadata: {
          role: account.role,
          promotedFromInstanceAdminList: promote,
          quotaCreated: true,
        },
      });

      log.info({ role: account.role }, "Account created");
    },

    async signIn({ user, isNewUser }) {
      if (!user.id) {
        return;
      }

      const account = await markSignedIn(user.id);
      const context = await readRequestContext();

      await recordAudit({
        actor: buildUserActor({
          userId: user.id,
          role: account?.role ?? user.role,
          email: account?.email ?? user.email ?? null,
          sessionId: null,
          context,
        }),
        action: "auth.sign_in.succeeded",
        resourceType: "session",
        targetUserId: user.id,
        metadata: {
          provider: "magic-link",
          isNewUser: isNewUser === true,
        },
      });
    },

    async signOut(message) {
      const session = endedSession(message);
      const userId = session?.userId ?? null;
      const sessionId = session?.id ?? null;
      const context = await readRequestContext();
      const account = userId ? await findAccountById(userId) : null;

      await recordAudit({
        actor: userId
          ? buildUserActor({
              userId,
              role: account?.role ?? "USER",
              email: account?.email ?? null,
              sessionId,
              context,
            })
          : anonymousAuditActor(context.requestId, {
              ipHash: context.ipHash,
              userAgentHash: context.userAgentHash,
            }),
        action: "auth.sign_out",
        resourceType: "session",
        resourceId: sessionId,
        ...(userId ? { targetUserId: userId } : {}),
        metadata: { hadDatabaseSession: session !== null },
      });
    },
  },
  logger: {
    error(error) {
      log.error({ err: error }, "Auth.js error");
    },
    warn(code) {
      log.warn({ code }, "Auth.js warning");
    },
    debug(message) {
      log.debug({ authMessage: message }, "Auth.js debug");
    },
  },
};

export const nextAuth = NextAuth(authConfig);
