import { requireActor } from "@/lib/auth";
import { recordAudit } from "@/lib/audit/service";
import { isAppError } from "@/lib/core/errors";
import { getEscalationSummary } from "@/lib/db/repositories/requestEscalation";
import { attachmentDisposition } from "@/lib/evidence/files";
import { escalationSummaryText } from "@/lib/requests/escalation";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireActor();
    const summary = await getEscalationSummary(actor, (await params).id);
    await recordAudit({
      actor,
      action: "request.downloaded",
      resourceType: "removal_request",
      resourceId: summary.requestId,
      metadata: { escalationSummary: true },
    });
    return new Response(escalationSummaryText(summary), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": attachmentDisposition(
          "privacy-request-escalation-summary.txt"
        ),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      isAppError(error)
        ? { error: error.code, message: error.message }
        : { error: "INTERNAL_ERROR" },
      {
        status: isAppError(error) ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
