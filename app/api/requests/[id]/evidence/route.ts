import { requireActor } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { listRequestEvidenceChoices } from "@/lib/db/repositories/requestEvidence";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireActor();
    const query = new URL(request.url).searchParams;
    const input = Object.fromEntries(
      [...new Set(query.keys())].map((key) => [
        key,
        query.getAll(key).length > 1 ? query.getAll(key) : query.get(key),
      ])
    );
    const page = await listRequestEvidenceChoices(actor, (await params).id, input);
    return Response.json(page, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json(
      { error: isAppError(error) ? error.code : "INTERNAL_ERROR" },
      {
        status: isAppError(error) ? error.status : 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
