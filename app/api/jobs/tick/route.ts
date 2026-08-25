import type { NextRequest } from "next/server";

import { env } from "@/lib/config/env";
import { hasValidBearerToken } from "@/lib/security/timingSafe";
import { createJobHandlers } from "@/lib/jobs/handlers";
import { ensureRecurringJobs } from "@/lib/jobs/recurring";
import { processOnce } from "@/lib/jobs/queue";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const secret = env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured." }, { status: 404 });
  }
  if (!hasValidBearerToken(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  await ensureRecurringJobs();
  const processed = await processOnce(
    `cron-${crypto.randomUUID().slice(0, 8)}`,
    createJobHandlers()
  );
  return Response.json({ processed });
}
