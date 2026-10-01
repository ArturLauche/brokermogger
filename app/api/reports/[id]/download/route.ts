import { requireActor } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { attachmentDisposition } from "@/lib/evidence/files";
import { downloadReport } from "@/lib/reports/service";
import { entityIdSchema } from "@/lib/validation/ids";
import { parseWithSchema } from "@/lib/validation/form";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    const result = await downloadReport(actor, parseWithSchema(entityIdSchema, id));
    return new Response(Uint8Array.from(result.body), {
      headers: {
        "Content-Type": result.format === "PDF" ? "application/pdf" : "application/json",
        "Content-Disposition": attachmentDisposition(result.filename),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: isAppError(error) ? error.code : "INTERNAL_ERROR",
        message: isAppError(error)
          ? error.message
          : "The report could not be downloaded. Try again.",
      },
      {
        status: isAppError(error) ? error.status : 500,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  }
}
