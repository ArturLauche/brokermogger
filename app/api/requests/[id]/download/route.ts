import { requireActor } from "@/lib/auth";
import { recordAudit } from "@/lib/audit/service";
import { isAppError } from "@/lib/core/errors";
import { getApprovedManualMessage } from "@/lib/db/repositories/requestManual";
import { attachmentDisposition } from "@/lib/evidence/files";
import { parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireActor();
    const id = parseWithSchema(entityIdSchema, (await params).id);
    const message = await getApprovedManualMessage(actor, id);
    await recordAudit({
      actor,
      action: "request.downloaded",
      resourceType: "removal_request",
      resourceId: id,
    });
    return new Response(`Subject: ${message.subject}\n\n${message.body}\n`, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": attachmentDisposition("approved-request.txt"),
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
