/**
 * Liveness and readiness probe.
 *
 * Always answers 200 while the process is up so that a load balancer can tell
 * "app is running" from "database is down": the payload carries the database
 * state instead. Nothing about the configuration is exposed, only the
 * environment name that is already visible in the UI.
 */
import { checkDatabaseReachable } from "@/lib/db/repositories/health";
import { env } from "@/lib/config/env";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseReachable = await checkDatabaseReachable();

  return Response.json(
    {
      status: "ok",
      appEnv: env.APP_ENV,
      time: new Date().toISOString(),
      database: databaseReachable ? "ok" : "unreachable",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
