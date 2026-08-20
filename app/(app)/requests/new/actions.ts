"use server";

import { redirect } from "next/navigation";

import { requireActor } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import { generateRequests } from "@/lib/requests/lifecycle";
import type { RequestType } from "@prisma/client";

export async function createWorkflow(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const profileId = String(formData.get("profileId") ?? "");
  const requestType = String(formData.get("requestType") ?? "DELETION") as RequestType;
  const brokerIds = formData.getAll("brokerId").map(String).filter(Boolean);
  const identifierIds = formData.getAll("identifierId").map(String).filter(Boolean);

  if (!profileId || brokerIds.length === 0 || identifierIds.length === 0) {
    redirect("/requests/new?error=VALIDATION_FAILED");
  }

  try {
    const result = await generateRequests(actor, {
      profileId,
      brokerIds,
      requestType,
      identifierIds,
    });
    redirect(`/requests?created=${result.requestIds.length}`);
  } catch (error) {
    if (isAppError(error)) {
      redirect(`/requests/new?error=${error.code}`);
    }
    throw error;
  }
}
