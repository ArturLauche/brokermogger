import { requireActor } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { attachmentDisposition } from "@/lib/evidence/files";
import { downloadAccountExport } from "@/lib/exports/service";
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
    const { body, filename } = await downloadAccountExport(
      actor,
      parseWithSchema(entityIdSchema, id)
    );
    return new Response(Uint8Array.from(body), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": attachmentDisposition(filename),
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
          : "This copy could not be downloaded. Try again.",
      },
      {
        status: isAppError(error) ? error.status : 500,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  }
}
