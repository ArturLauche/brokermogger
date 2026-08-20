/**
 * Auth.js route handler.
 *
 * Exposes the sign in, callback, session and CSRF endpoints. All behaviour lives
 * in `lib/auth/config.ts`; this file only wires the handlers into the router.
 */
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;

export const dynamic = "force-dynamic";
