"use server";

import { redirect } from "next/navigation";

import { requireActor } from "@/lib/auth";
import { isAppError } from "@/lib/core/errors";
import {
  approveRequest,
  closeRequest,
  markRequestCompleted,
  prepareFollowUp,
  returnRequestToDraft,
} from "@/lib/requests/lifecycle";

function bounce(requestId: string, error: unknown, fallback: string): never {
  if (isAppError(error)) {
    redirect(`${fallback}?error=${error.code}`);
  }
  throw error;
}

export async function approveRequestAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const requestId = String(formData.get("requestId") ?? "");
  const contentHash = String(formData.get("contentHash") ?? "");
  const confirmationAccepted = formData.get("confirmationAccepted") === "on";
  try {
    await approveRequest(actor, { requestId, contentHash, confirmationAccepted });
  } catch (error) {
    bounce(requestId, error, `/requests/${requestId}/review`);
  }
  redirect(`/requests/${requestId}`);
}

export async function returnToDraftAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const requestId = String(formData.get("requestId") ?? "");
  try {
    await returnRequestToDraft(actor, requestId);
  } catch (error) {
    bounce(requestId, error, `/requests/${requestId}/review`);
  }
  redirect(`/requests/${requestId}`);
}

export async function closeRequestAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const requestId = String(formData.get("requestId") ?? "");
  try {
    await closeRequest(actor, requestId);
  } catch (error) {
    bounce(requestId, error, `/requests/${requestId}`);
  }
  redirect(`/requests/${requestId}`);
}

export async function markCompletedAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const requestId = String(formData.get("requestId") ?? "");
  try {
    await markRequestCompleted(actor, requestId);
  } catch (error) {
    bounce(requestId, error, `/requests/${requestId}`);
  }
  redirect(`/requests/${requestId}`);
}

export async function prepareFollowUpAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const requestId = String(formData.get("requestId") ?? "");
  try {
    await prepareFollowUp(actor, requestId);
  } catch (error) {
    bounce(requestId, error, `/requests/${requestId}`);
  }
  redirect(`/requests/${requestId}`);
}
