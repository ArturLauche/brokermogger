import { getOwnedRequest } from "@/lib/db/repositories/requests";
import type { ActorContext } from "@/lib/permissions/actor";
import { canTransition } from "@/lib/requests/stateMachine";

import { transition } from "./transitions";
export async function markNoResponse(
  actor: ActorContext,
  requestId: string
): Promise<void> {
  const request = await getOwnedRequest(actor, requestId);
  if (request.status === "NO_RESPONSE") {
    return;
  }
  if (!canTransition(request.status, "NO_RESPONSE", "SYSTEM")) {
    return;
  }
  await transition(
    actor,
    request.id,
    request.status,
    "NO_RESPONSE",
    "The recorded response date passed without a broker reply."
  );
}
