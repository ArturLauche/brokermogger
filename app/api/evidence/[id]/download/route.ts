import type { NextRequest } from "next/server";

import { requireActor } from "@/lib/auth";
import { downloadEvidence } from "@/lib/evidence/service";
import { isAppError } from "@/lib/core/errors";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const actor = await requireActor();
    const { id } = await context.params;
    const { file, body } = await downloadEvidence(actor, id);
    return new Response(Uint8Array.from(body), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filenameMasked ?? "evidence"}"`,
        "Cache-Control": "no-store",
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
