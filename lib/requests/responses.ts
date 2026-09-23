import {
  appendRequestEvent,
  getOwnedRequest,
  patchRequest,
} from "@/lib/db/repositories/requests";
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

export async function applyDeliveryOutcome(
  actor: ActorContext,
  requestId: string,
  outcome: "delivered" | "bounced"
): Promise<void> {
  const request = await getOwnedRequest(actor, requestId);

  if (outcome === "delivered") {
    if (request.status === "SENT" && canTransition("SENT", "DELIVERED", "SYSTEM")) {
      await transition(
        actor,
        request.id,
        "SENT",
        "DELIVERED",
        "The email provider confirmed delivery."
      );
      await transition(
        actor,
        request.id,
        "DELIVERED",
        "WAITING_FOR_BROKER",
        "Awaiting a broker reply."
      );
      return;
    }
    if (
      request.status === "DELIVERED" &&
      canTransition("DELIVERED", "WAITING_FOR_BROKER", "SYSTEM")
    ) {
      await transition(
        actor,
        request.id,
        "DELIVERED",
        "WAITING_FOR_BROKER",
        "Awaiting a broker reply."
      );
      return;
    }
    if (request.status === "WAITING_FOR_BROKER" || request.status === "FOLLOW_UP_SENT") {
      if (request.deliveredAt) {
        return;
      }
      await patchRequest(actor, request.id, { deliveredAt: new Date() });
      await appendRequestEvent({
        removalRequestId: request.id,
        type: "EMAIL_DELIVERED",
        fromStatus: request.status,
        toStatus: request.status,
        actorType: "SYSTEM",
        actorUserId: actor.userId,
        message: "The email provider confirmed delivery.",
      });
    }
    return;
  }

  if (request.status === "SENT" && canTransition("SENT", "FAILED", "SYSTEM")) {
    await transition(
      actor,
      request.id,
      "SENT",
      "FAILED",
      "The email provider reported a bounce."
    );
    return;
  }

  if (
    request.status === "WAITING_FOR_BROKER" &&
    canTransition("WAITING_FOR_BROKER", "NEEDS_USER_ACTION", "SYSTEM")
  ) {
    await transition(
      actor,
      request.id,
      "WAITING_FOR_BROKER",
      "NEEDS_USER_ACTION",
      "Delivery failed after the request was already waiting for a broker reply."
    );
  }
}
