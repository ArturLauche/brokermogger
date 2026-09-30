import { notFound } from "next/navigation";
import { isAppError } from "@/lib/core/errors";
import { getOwnedRequest } from "@/lib/db/repositories/requests";
import type { ActorContext } from "@/lib/permissions/actor";

export async function loadPrivateRequest(actor: ActorContext, id: string) {
  return getOwnedRequest(actor, id).catch((error) => {
    if (
      isAppError(error) &&
      ["NOT_FOUND", "FORBIDDEN", "VALIDATION_FAILED"].includes(error.code)
    )
      notFound();
    throw error;
  });
}
