/**
 * Readiness probe.
 *
 * `/api/health` stays HTTP 200 while the process is up so a load balancer can
 * tell liveness from database failure. This route returns 503 when Postgres is
 * unreachable so an orchestrator can stop sending traffic.
 */
import { checkDatabaseReachable } from "@/lib/db/repositories/health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseReachable = await checkDatabaseReachable();

  return Response.json(
    {
      status: databaseReachable ? "ok" : "not_ready",
      database: databaseReachable ? "ok" : "unreachable",
      time: new Date().toISOString(),
    },
    {
      status: databaseReachable ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
