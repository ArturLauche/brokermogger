import type { NextRequest } from "next/server";

import { requireActor } from "@/lib/auth";
import { downloadEvidence } from "@/lib/evidence/service";
import { isAppError } from "@/lib/core/errors";
import { attachmentDisposition } from "@/lib/evidence/files";
import { entityIdSchema } from "@/lib/validation/ids";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    const { file, body } = await downloadEvidence(actor, entityIdSchema.parse(id));
    return new Response(Uint8Array.from(body), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": attachmentDisposition(file.filenameMasked ?? "evidence"),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return Response.json(
        { error: error.code, message: error.message },
        { status: error.status }
      );
    }
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
