import type { NextRequest } from "next/server";

import { env } from "@/lib/config/env";
import { readOperationalMetrics } from "@/lib/db/repositories/metrics";
import { hasValidBearerToken } from "@/lib/security/timingSafe";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const token = env.METRICS_TOKEN;
  if (!token) {
    return Response.json({ error: "Metrics are disabled." }, { status: 404 });
  }
  if (!hasValidBearerToken(request.headers.get("authorization"), token)) {
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
    "# HELP brokermogger_jobs_due Jobs eligible to run now.",
    "# TYPE brokermogger_jobs_due gauge",
    `brokermogger_jobs_due ${metrics.jobsDue}`,
    "# HELP brokermogger_queue_oldest_due_seconds Age of the oldest due job; future jobs are excluded.",
    "# TYPE brokermogger_queue_oldest_due_seconds gauge",
    `brokermogger_queue_oldest_due_seconds ${metrics.oldestDueAgeSeconds}`,
    "# HELP brokermogger_workers_active Process heartbeats seen within 60 seconds.",
    "# TYPE brokermogger_workers_active gauge",
    `brokermogger_workers_active ${metrics.workersActive}`,
    "# HELP brokermogger_job_leases_expired Running jobs with an expired lease.",
    "# TYPE brokermogger_job_leases_expired gauge",
    `brokermogger_job_leases_expired ${metrics.expiredJobLeases}`,
    "# HELP brokermogger_delivery_ambiguous Broker messages requiring outcome reconciliation.",
    "# TYPE brokermogger_delivery_ambiguous gauge",
    `brokermogger_delivery_ambiguous ${metrics.ambiguousDeliveries}`,
    "# HELP brokermogger_notification_delivery_ambiguous Uncertain notification email outcomes.",
    "# TYPE brokermogger_notification_delivery_ambiguous gauge",
    `brokermogger_notification_delivery_ambiguous ${metrics.ambiguousNotifications}`,
    "# HELP brokermogger_deletion_backlog Accounts whose requested erasure is unfinished.",
    "# TYPE brokermogger_deletion_backlog gauge",
    `brokermogger_deletion_backlog ${metrics.deletionBacklog}`,
    "# HELP brokermogger_deletion_oldest_seconds Age of the oldest unfinished account erasure.",
    "# TYPE brokermogger_deletion_oldest_seconds gauge",
    `brokermogger_deletion_oldest_seconds ${metrics.oldestDeletionAgeSeconds}`,
    "# HELP brokermogger_file_purge_backlog Objects awaiting recoverable storage deletion.",
    "# TYPE brokermogger_file_purge_backlog gauge",
    `brokermogger_file_purge_backlog ${metrics.filesPendingPurge}`,
    "# HELP brokermogger_auth_unknown_network_attempts_24h Committed sign-in admission attempts without trusted IP attribution in the last 24 hours; includes quota denials and excludes rolled-back failures.",
    "# TYPE brokermogger_auth_unknown_network_attempts_24h gauge",
    `brokermogger_auth_unknown_network_attempts_24h ${metrics.unknownNetworkAuthAttempts24h}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
