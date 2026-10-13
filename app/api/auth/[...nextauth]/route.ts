/**
 * Auth.js route handler.
 *
 * Exposes the sign in, callback, session and CSRF endpoints. Auth policy lives
 * in `lib/auth/config.ts`; this adapter supplies hashed context and canonical
 * first-leg verification replies.
 */
import { handlers } from "@/lib/auth";
import { withMagicLinkContext } from "@/lib/auth/magicLinkContext";
import { requestContextFromHeaders } from "@/lib/auth/requestContext";
import { MAGIC_LINK_VERIFY_PATH } from "@/lib/auth/magicLinkRateLimit";
import { env } from "@/lib/config/env";

export const GET: typeof handlers.GET = (request) =>
  withMagicLinkContext(
    { ...requestContextFromHeaders(request.headers), entryPoint: "auth_api" },
    () => handlers.GET(request)
  );

export const POST: typeof handlers.POST = (request) =>
  withMagicLinkContext(
    { ...requestContextFromHeaders(request.headers), entryPoint: "auth_api" },
    async () => {
      const response = await handlers.POST(request);
      const location = response.headers.get("location");
      if (
        new URL(request.url).pathname !== "/api/auth/signin/magic-link" ||
        !location ||
        new URL(location, env.APP_BASE_URL).pathname !== "/api/auth/verify-request"
      )
        return response;

      // Auth.js may derive its allowed redirect from a different host than
      // the callback gate. Make both outcomes identical, including JSON replies.
      const url = new URL(MAGIC_LINK_VERIFY_PATH, env.APP_BASE_URL).href;
      const headers = new Headers(response.headers);
      headers.set("location", url);
      headers.delete("content-length");
      const json = headers.get("content-type")?.includes("application/json");
      return new Response(json ? JSON.stringify({ url }) : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  );

export const dynamic = "force-dynamic";
