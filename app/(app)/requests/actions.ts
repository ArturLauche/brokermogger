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
import { formCheckbox, formString, parseWithSchema } from "@/lib/validation/form";
import { entityIdSchema } from "@/lib/validation/ids";
import { z } from "zod";

function bounce(requestId: string, error: unknown, fallback: string): never {
  if (isAppError(error)) {
    const target = requestId ? fallback : "/requests";
    redirect(`${target}?error=${error.code}`);
  }
  throw error;
}

const requestIdSchema = z.object({ requestId: entityIdSchema });

export async function approveRequestAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const rawId = formString(formData, "requestId");
  try {
    const { requestId } = parseWithSchema(requestIdSchema, { requestId: rawId });
    const envelopeHash = formString(formData, "envelopeHash");
    const confirmationAccepted = formCheckbox(formData, "confirmationAccepted");
    await approveRequest(actor, { requestId, envelopeHash, confirmationAccepted });
  } catch (error) {
    bounce(rawId, error, `/requests/${rawId}/review`);
  }
  redirect(`/requests/${rawId}`);
}

export async function returnToDraftAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const rawId = formString(formData, "requestId");
  try {
    const { requestId } = parseWithSchema(requestIdSchema, { requestId: rawId });
    await returnRequestToDraft(actor, requestId);
  } catch (error) {
    bounce(rawId, error, `/requests/${rawId}/review`);
  }
  redirect(`/requests/${rawId}/edit`);
}

export async function closeRequestAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const rawId = formString(formData, "requestId");
  try {
    const { requestId } = parseWithSchema(requestIdSchema, { requestId: rawId });
    await closeRequest(actor, requestId);
  } catch (error) {
    bounce(rawId, error, `/requests/${rawId}`);
  }
  redirect(`/requests/${rawId}`);
}

export async function markCompletedAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const rawId = formString(formData, "requestId");
  try {
    const { requestId } = parseWithSchema(requestIdSchema, { requestId: rawId });
    await markRequestCompleted(actor, requestId);
  } catch (error) {
    bounce(rawId, error, `/requests/${rawId}`);
  }
  redirect(`/requests/${rawId}`);
}

export async function prepareFollowUpAction(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const rawId = formString(formData, "requestId");
  try {
    const { requestId } = parseWithSchema(requestIdSchema, { requestId: rawId });
    await prepareFollowUp(actor, requestId);
  } catch (error) {
    bounce(rawId, error, `/requests/${rawId}`);
  }
  redirect(`/requests/${rawId}`);
}
