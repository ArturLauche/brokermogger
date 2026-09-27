import { exportAccountData } from "@/lib/account/service";
import { requireActor } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const actor = await requireActor();
    const body = await exportAccountData(actor);
    return new Response(Uint8Array.from(body), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="brokermogger-export.json"',
        "Cache-Control": "private, no-store",
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
