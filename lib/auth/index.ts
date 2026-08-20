/**
 * Public entry point of the authentication layer.
 *
 * Route handlers use `handlers`, server actions use `signIn` / `signOut`, and
 * everything that needs an identity uses the guards in `./guards`.
 */
import { nextAuth } from "./config";

export const { handlers, auth, signIn, signOut } = nextAuth;

export { authConfig } from "./config";
export {
  getActorContext,
  getSessionUser,
  requireActor,
  requireActorOrRedirect,
  requireRole,
  roleSatisfies,
  type SessionUser,
} from "./guards";
export { sessionCookieName, sessionCookieOptions, secureCookiesEnabled } from "./cookies";
export {
  buildUserActor,
  emailIndexFor,
  readRequestContext,
  USER_EMAIL_INDEX_SCOPE,
  type HashedRequestContext,
} from "./requestContext";
