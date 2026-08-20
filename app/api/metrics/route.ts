import type { NextRequest } from "next/server";

import { env } from "@/lib/config/env";
import { readOperationalMetrics } from "@/lib/db/repositories/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const token = env.METRICS_TOKEN;
  if (!token) {
    return Response.json({ error: "Metrics are disabled." }, { status: 404 });
  }
  const header = request.headers.get("authorization") ?? "";
  if (header !== `Bearer ${token}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const metrics = await readOperationalMetrics();
  const body = [
    "# HELP brokermogger_jobs_pending Jobs waiting or running.",
    "# TYPE brokermogger_jobs_pending gauge",
    `brokermogger_jobs_pending ${metrics.jobsPending}`,
    "# HELP brokermogger_jobs_failed Failed jobs.",
    "# TYPE brokermogger_jobs_failed gauge",
    `brokermogger_jobs_failed ${metrics.jobsFailed}`,
    "# HELP brokermogger_requests_open Open removal requests.",
    "# TYPE brokermogger_requests_open gauge",
    `brokermogger_requests_open ${metrics.requestsOpen}`,
    "# HELP brokermogger_users_active Active accounts.",
    "# TYPE brokermogger_users_active gauge",
    `brokermogger_users_active ${metrics.users}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
